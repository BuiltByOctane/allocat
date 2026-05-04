import Dexie, { type Table } from "dexie";
import type { Database } from "@/lib/types/database";

// ─── Row types from the DB schema ────────────────────────────────────────────
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type BudgetRow = Database["public"]["Tables"]["budgets"]["Row"];
export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
export type BudgetItemRow = Database["public"]["Tables"]["budget_items"]["Row"];
export type GoalRow = Database["public"]["Tables"]["goals"]["Row"];
export type AssetRow = Database["public"]["Tables"]["assets"]["Row"];
export type AssetCategoryRow = Database["public"]["Tables"]["asset_categories"]["Row"];
export type AssetValueHistoryRow = Database["public"]["Tables"]["asset_value_history"]["Row"];
export type DebtRow = Database["public"]["Tables"]["debts"]["Row"];
export type ReportRow = Database["public"]["Tables"]["reports"]["Row"];
export type SnapshotRow =
  Database["public"]["Tables"]["net_worth_snapshots"]["Row"];
export type ActivityLogRow = Database["public"]["Tables"]["activity_logs"]["Row"];

// ─── Sync infrastructure types ────────────────────────────────────────────────
export type SyncTable =
  | "profiles"
  | "budgets"
  | "categories"
  | "budget_items"
  | "goals"
  | "assets"
  | "asset_categories"
  | "asset_value_history"
  | "debts"
  | "reports"
  | "net_worth_snapshots";

export type SyncOperation =
  | "INSERT"
  | "UPDATE"
  | "DELETE"
  | "PAYMENT"
  | "BULK_SETUP";

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
  goals!: Table<GoalRow, string>;
  assets!: Table<AssetRow, string>;
  asset_categories!: Table<AssetCategoryRow, string>;
  asset_value_history!: Table<AssetValueHistoryRow, string>;
  debts!: Table<DebtRow, string>;
  reports!: Table<ReportRow, string>;
  net_worth_snapshots!: Table<SnapshotRow, string>;

  activity_logs!: Table<ActivityLogRow, string>;

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
  }
}
