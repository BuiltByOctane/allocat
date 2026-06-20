import { createClient } from "@/lib/supabase/client";
import { getDB } from "./index";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const USER_META_KEY = "__userId__";

/** Returns true if the table has never been synced or was synced more than 5 min ago. */
export async function isTableStale(table: string): Promise<boolean> {
  const db = getDB();
  const meta = await db.sync_meta.get(table);
  if (!meta) return true;
  return Date.now() - meta.lastSynced > STALE_THRESHOLD_MS;
}

/**
 * Build, per table, the set of record ids that have un-synced local mutations
 * in flight — so a blanket server pull won't clobber optimistic-but-unsynced
 * state.
 *
 * The classic bug: the user allocates an `sms_transactions` row (status set to
 * `categorized` optimistically) but the CATEGORIZE op hasn't drained yet; a
 * hydrate then bulkPuts the server row (still `pending`) and reverts the local
 * row, popping it back into the pending list until the next reconcile.
 *
 * A record is "protected" when a `pending`/`processing` sync_queue item targets
 * it. We bucket by `item.table` and protect both:
 *   - `item.recordId` (the local IDB id — a `temp_` id for un-flushed INSERTs,
 *     or a real id for UPDATE/CATEGORIZE/etc.), and
 *   - for a `temp_` recordId, its already-mapped real id (from `id_map`) — the
 *     INSERT may have synced (temp→real swapped in IDB) while a follow-up op
 *     for the same row is still queued under the temp recordId.
 */
async function buildProtectedIds(): Promise<Map<string, Set<string>>> {
  const db = getDB();
  const protectedByTable = new Map<string, Set<string>>();

  const pending = await db.sync_queue
    .where("status")
    .anyOf(["pending", "processing"])
    .toArray();

  for (const item of pending) {
    const set = protectedByTable.get(item.table) ?? new Set<string>();
    set.add(item.recordId);
    if (item.recordId.startsWith("temp_")) {
      const mapped = await db.id_map.get(item.recordId);
      if (mapped?.realId) set.add(mapped.realId);
    }
    protectedByTable.set(item.table, set);
  }

  return protectedByTable;
}

/**
 * Drop server rows whose id is protected (an un-synced local mutation is in
 * flight for it). We keep the local optimistic row untouched — the pending sync
 * will reconcile it — instead of letting the server pull overwrite it. Local
 * `temp_` rows are never present in the server payload, so they're inherently
 * preserved here too.
 */
function filterProtected<T extends { id: string }>(
  rows: T[] | null | undefined,
  protectedIds: Set<string> | undefined,
): T[] {
  if (!rows) return [];
  if (!protectedIds || protectedIds.size === 0) return rows;
  return rows.filter((r) => !protectedIds.has(r.id));
}

/**
 * Fetches ALL tables from Supabase for the current user and bulk-writes into IDB.
 * Called once at app startup (SyncProvider mount). Uses bulkPut for upsert semantics.
 *
 * If the stored user ID in IDB differs from the current user (different person
 * logged in on the same device), IDB is wiped first before re-hydrating.
 */
export async function hydrateAllTables(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const db = getDB();
  const userId = user.id;

  // Guard: if a different user's data is cached, clear everything first
  const storedMeta = await db.sync_meta.get(USER_META_KEY);
  const storedUserId = storedMeta?.userId;
  if (storedUserId && storedUserId !== userId) {
    await clearDB();
  }

  // Store the current user's ID so we can detect account changes on next open
  await db.sync_meta.put({ table: USER_META_KEY, lastSynced: Date.now(), userId });

  // Parallel fetch every table
  const [
    { data: profiles },
    { data: budgets },
    { data: categories },
    { data: budgetItems },
    { data: assets },
    { data: assetCategories },
    { data: assetValueHistory },
    { data: debts },
    { data: reports },
    { data: snapshots },
    { data: activityLogs },
    { data: merchantRules },
    { data: smsTransactions },
    { data: smsBlocklist },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId),
    supabase.from("budgets").select("*").eq("user_id", userId),
    supabase.from("categories").select("*").eq("user_id", userId),
    supabase.from("budget_items").select("*").eq("user_id", userId),
    supabase.from("assets").select("*").eq("user_id", userId),
    supabase.from("asset_categories").select("*").eq("user_id", userId),
    supabase
      .from("asset_value_history")
      .select("*")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .limit(500),
    supabase.from("debts").select("*").eq("user_id", userId),
    supabase.from("reports").select("*").eq("user_id", userId),
    supabase
      .from("net_worth_snapshots")
      .select("*")
      .eq("user_id", userId)
      .order("snapshot_date", { ascending: true })
      .limit(24),
    supabase
      .from("activity_logs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("merchant_rules").select("*").eq("user_id", userId),
    supabase
      .from("sms_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("sms_blocklist").select("*").eq("user_id", userId),
  ]);

  const now = Date.now();

  // Protect optimistic-but-unsynced local rows from being clobbered by the
  // blanket server pull (see buildProtectedIds). Rows whose id has an in-flight
  // mutation are filtered OUT of the bulkPut below; the pending sync reconciles
  // them. (temp_ rows aren't in the server payload, so they survive regardless.)
  const protectedIds = await buildProtectedIds();
  const keep = <T extends { id: string }>(
    table: string,
    rows: T[] | null | undefined,
  ): T[] => filterProtected(rows, protectedIds.get(table));

  // Bulk-upsert all tables in parallel
  await Promise.all([
    profiles?.length ? db.profiles.bulkPut(profiles) : Promise.resolve(),
    budgets?.length
      ? db.budgets.bulkPut(keep("budgets", budgets))
      : Promise.resolve(),
    categories?.length
      ? db.categories.bulkPut(keep("categories", categories))
      : Promise.resolve(),
    budgetItems?.length
      ? db.budget_items.bulkPut(keep("budget_items", budgetItems))
      : Promise.resolve(),
    assets?.length
      ? db.assets.bulkPut(keep("assets", assets))
      : Promise.resolve(),
    assetCategories?.length
      ? db.asset_categories.bulkPut(keep("asset_categories", assetCategories))
      : Promise.resolve(),
    assetValueHistory?.length
      ? db.asset_value_history.bulkPut(
          keep("asset_value_history", assetValueHistory),
        )
      : Promise.resolve(),
    debts?.length ? db.debts.bulkPut(keep("debts", debts)) : Promise.resolve(),
    reports?.length ? db.reports.bulkPut(reports) : Promise.resolve(),
    snapshots?.length
      ? db.net_worth_snapshots.bulkPut(snapshots)
      : Promise.resolve(),
    activityLogs?.length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? db.activity_logs.bulkPut(activityLogs as any)
      : Promise.resolve(),
    merchantRules?.length
      ? db.merchant_rules.bulkPut(keep("merchant_rules", merchantRules))
      : Promise.resolve(),
    smsTransactions?.length
      ? db.sms_transactions.bulkPut(keep("sms_transactions", smsTransactions))
      : Promise.resolve(),
    smsBlocklist?.length
      ? db.sms_blocklist.bulkPut(keep("sms_blocklist", smsBlocklist))
      : Promise.resolve(),
  ]);

  // Stamp sync_meta for all tables
  const DATA_TABLES = [
    "profiles",
    "budgets",
    "categories",
    "budget_items",
    "assets",
    "asset_categories",
    "asset_value_history",
    "debts",
    "reports",
    "net_worth_snapshots",
    "activity_logs",
    "merchant_rules",
    "sms_transactions",
    "sms_blocklist",
  ] as const;

  await db.sync_meta.bulkPut(
    DATA_TABLES.map((table) => ({ table, lastSynced: now }))
  );
}

/**
 * Only re-fetches a single table from Supabase if it's considered stale (>5 min old).
 * After fetch, upserts records into IDB and updates sync_meta.
 */
export async function refreshTableIfStale(
  table:
    | "budgets"
    | "categories"
    | "budget_items"
    | "assets"
    | "asset_categories"
    | "asset_value_history"
    | "debts"
    | "net_worth_snapshots"
    | "reports"
): Promise<void> {
  const stale = await isTableStale(table);
  if (!stale) return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const db = getDB();

  const query = supabase.from(table).select("*").eq("user_id", user.id);

  const { data } = await query;
  if (data?.length) {
    // Same protection as hydrateAllTables — never overwrite a row with an
    // in-flight local mutation queued against it.
    const protectedIds = (await buildProtectedIds()).get(table);
    await db.table(table).bulkPut(filterProtected(data, protectedIds));
  }
  await db.sync_meta.put({ table, lastSynced: Date.now() });
}

/**
 * Force-refresh a single table from Supabase regardless of staleness.
 * Use after a sync that may have triggered server-side cascades (e.g. a
 * budget_items UPDATE that cascaded into assets / debts).
 */
export async function forceRefreshTable(
  table:
    | "budgets"
    | "categories"
    | "budget_items"
    | "assets"
    | "asset_categories"
    | "asset_value_history"
    | "debts"
    | "net_worth_snapshots"
    | "reports"
): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const db = getDB();
  const { data } = await supabase.from(table).select("*").eq("user_id", user.id);
  if (data?.length) {
    // Same protection as hydrateAllTables — never overwrite a row with an
    // in-flight local mutation queued against it.
    const protectedIds = (await buildProtectedIds()).get(table);
    await db.table(table).bulkPut(filterProtected(data, protectedIds));
  }
  await db.sync_meta.put({ table, lastSynced: Date.now() });
}

/** Wipes all user data from IDB — also called when a different user logs in. */
export async function clearDB(): Promise<void> {
  const db = getDB();
  await Promise.all([
    db.profiles.clear(),
    db.budgets.clear(),
    db.categories.clear(),
    db.budget_items.clear(),
    db.assets.clear(),
    db.asset_categories.clear(),
    db.asset_value_history.clear(),
    db.debts.clear(),
    db.reports.clear(),
    db.net_worth_snapshots.clear(),
    db.activity_logs.clear(),
    db.merchant_rules.clear(),
    db.sms_transactions.clear(),
    db.sms_blocklist.clear(),
    db.id_map.clear(),
    db.sync_meta.clear(),
    db.sync_queue.clear(),
  ]);
}
