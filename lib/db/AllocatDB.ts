import Dexie, { type Table } from "dexie";
import type { Database } from "@/lib/types/database";

// ─── Row types from the DB schema ────────────────────────────────────────────
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type BudgetRow = Database["public"]["Tables"]["budgets"]["Row"];
export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
export type BudgetItemRow = Database["public"]["Tables"]["budget_items"]["Row"];
export type AssetRow = Database["public"]["Tables"]["assets"]["Row"];
export type AssetCategoryRow = Database["public"]["Tables"]["asset_categories"]["Row"];
export type AssetValueHistoryRow = Database["public"]["Tables"]["asset_value_history"]["Row"];
export type DebtRow = Database["public"]["Tables"]["debts"]["Row"];
export type ReportRow = Database["public"]["Tables"]["reports"]["Row"];
export type SnapshotRow =
  Database["public"]["Tables"]["net_worth_snapshots"]["Row"];
export type ActivityLogRow = Database["public"]["Tables"]["activity_logs"]["Row"];
export type MerchantRuleRow = Database["public"]["Tables"]["merchant_rules"]["Row"];
export type SmsTransactionRow =
  Database["public"]["Tables"]["sms_transactions"]["Row"];
export type SmsBlocklistRow =
  Database["public"]["Tables"]["sms_blocklist"]["Row"];

// ─── Sync infrastructure types ────────────────────────────────────────────────
export type SyncTable =
  | "profiles"
  | "budgets"
  | "categories"
  | "budget_items"
  | "assets"
  | "asset_categories"
  | "asset_value_history"
  | "debts"
  | "reports"
  | "net_worth_snapshots"
  | "merchant_rules"
  | "sms_transactions"
  | "sms_blocklist";

export type SyncOperation =
  | "INSERT"
  | "UPDATE"
  | "DELETE"
  | "PAYMENT"
  | "BULK_SETUP"
  | "ACHIEVE"
  | "CATEGORIZE"
  | "IGNORE"
  | "UNALLOCATE"
  | "RECATEGORIZE";

export type SyncStatus = "pending" | "processing" | "done" | "failed";

export interface SyncQueueItem {
  id?: number; // auto-increment primary key
  table: SyncTable;
  operation: SyncOperation;
  /** Local IDB id of the affected record (may be a tempId for INSERTs) */
  recordId: string;
  /** Populated only for INSERTs — the `temp_<uuid>` assigned locally */
  tempId?: string;
  /** Arguments the corresponding server action expects */
  payload: Record<string, unknown>;
  retries: number;
  status: SyncStatus;
  createdAt: number; // Date.now()
  lastError?: string;
}

export interface IdMapEntry {
  tempId: string; // primary key
  realId: string;
  table: SyncTable;
}

export interface SyncMetaEntry {
  table: string; // primary key — also used for the special "__userId__" entry
  lastSynced: number;
  /** Only populated on the __userId__ entry to detect account changes. */
  userId?: string;
}

// ─── Dexie class ─────────────────────────────────────────────────────────────
export class AllocatDB extends Dexie {
  profiles!: Table<ProfileRow, string>;
  budgets!: Table<BudgetRow, string>;
  categories!: Table<CategoryRow, string>;
  budget_items!: Table<BudgetItemRow, string>;
  assets!: Table<AssetRow, string>;
  asset_categories!: Table<AssetCategoryRow, string>;
  asset_value_history!: Table<AssetValueHistoryRow, string>;
  debts!: Table<DebtRow, string>;
  reports!: Table<ReportRow, string>;
  net_worth_snapshots!: Table<SnapshotRow, string>;

  activity_logs!: Table<ActivityLogRow, string>;
  merchant_rules!: Table<MerchantRuleRow, string>;
  sms_transactions!: Table<SmsTransactionRow, string>;
  sms_blocklist!: Table<SmsBlocklistRow, string>;

  sync_queue!: Table<SyncQueueItem, number>;
  id_map!: Table<IdMapEntry, string>;
  sync_meta!: Table<SyncMetaEntry, string>;

  constructor() {
    super("AllocatDB");

    this.version(1).stores({
      // Data tables — indexed fields only (Dexie does not store non-indexed fields here)
      profiles: "id",
      budgets: "id, user_id, [month+year]",
      categories: "id, budget_id, user_id",
      budget_items: "id, category_id, user_id",
      goals: "id, user_id",
      assets: "id, user_id",
      debts: "id, user_id, type, is_closed",
      reports: "id, budget_id, user_id, [month+year]",
      net_worth_snapshots: "id, user_id, snapshot_date",

      // Sync infrastructure
      sync_queue: "++id, status, createdAt, table",
      id_map: "tempId, realId, table",
      sync_meta: "table",
    });

    this.version(2).stores({
      goals: "id, user_id, created_at",
      assets: "id, user_id, created_at",
      debts: "id, user_id, type, is_closed, created_at",
    });

    this.version(3).stores({
      asset_categories: "id, user_id, created_at",
      asset_value_history: "id, asset_id, user_id, entry_date, created_at",
    });

    this.version(4).stores({
      activity_logs: "id, user_id, created_at, category",
    });

    this.version(5).stores({
      budget_items: "id, category_id, user_id, [link_type+link_id]",
      goals: "id, user_id, created_at, linked_asset_id",
    });

    // v6: drop `goals` table — merged into `assets` with is_goal/target_amount.
    // Add asset indexes for goal queries + achievement state.
    this.version(6)
      .stores({
        goals: null,
        assets: "id, user_id, created_at, [user_id+is_goal], achieved_at",
      })
      .upgrade(async (tx) => {
        // Clear any stale link_type='goal' values on existing IDB budget_items.
        // The server-side migration rewrote these to link_type='asset' with
        // mapped link_id; hydration will overwrite with the correct values.
        // Until that happens, null them out so client-side cascade no-ops
        // safely instead of getting stuck on an unknown link_type.
        const items = tx.table("budget_items");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await items.toCollection().modify((item: any) => {
          if (item.link_type === "goal") {
            item.link_type = null;
            item.link_id = null;
          }
        });
        // Force re-hydration of budget_items + assets next mount
        const meta = tx.table("sync_meta");
        await meta.delete("budget_items");
        await meta.delete("assets");
      });

    // v7: profiles.currency added (display preference). Column is non-indexed
    // so the profiles schema string is unchanged; the version bump exists to
    // force a re-hydration so the new column is present on cached rows.
    this.version(7).upgrade(async (tx) => {
      const meta = tx.table("sync_meta");
      await meta.delete("profiles");
    });

    // v8: SMS transaction ingestion + merchant→budget learning rules.
    this.version(8).stores({
      merchant_rules: "id, user_id, match_type, [user_id+match_type], created_at",
      sms_transactions:
        "id, user_id, status, dedupe_key, [user_id+status], occurred_at, created_at",
    });

    // v9: per-entity `color` (palette key) added to categories/assets/debts/
    // asset_categories. Non-indexed display field → schema strings unchanged;
    // the bump only forces re-hydration so the new column lands on cached rows.
    this.version(9).upgrade(async (tx) => {
      const meta = tx.table("sync_meta");
      await meta.delete("categories");
      await meta.delete("assets");
      await meta.delete("debts");
      await meta.delete("asset_categories");
    });

    // v10: per-item `emoji` added to budget_items (optional display glyph).
    // Non-indexed → schema string unchanged; the bump only forces re-hydration
    // so the new column lands on cached budget_items rows.
    this.version(10).upgrade(async (tx) => {
      await tx.table("sync_meta").delete("budget_items");
    });

    // v11: subscription/trial columns added to profiles (subscription_status,
    // trial_started_at, trial_ends_at, plan, subscription_expires_at,
    // trial_device_id). Non-indexed → profiles schema string unchanged; the bump
    // only forces re-hydration so the new columns land on cached profile rows.
    this.version(11).upgrade(async (tx) => {
      await tx.table("sync_meta").delete("profiles");
    });

    // v12: sms_transactions.label added (custom display name for a txn).
    // Non-indexed → schema string unchanged; the bump forces re-hydration so the
    // new column lands on cached sms_transactions rows.
    this.version(12).upgrade(async (tx) => {
      await tx.table("sync_meta").delete("sms_transactions");
    });

    // v13: sms_blocklist — per-user list of SMS *template* keys the user reported
    // as wrongly captured, so future SMS matching the same template are skipped.
    this.version(13).stores({
      sms_blocklist: "id, user_id, template_key, created_at",
    });
  }
}
