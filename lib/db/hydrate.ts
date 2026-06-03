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
  ]);

  const now = Date.now();

  // Bulk-upsert all tables in parallel
  await Promise.all([
    profiles?.length ? db.profiles.bulkPut(profiles) : Promise.resolve(),
    budgets?.length ? db.budgets.bulkPut(budgets) : Promise.resolve(),
    categories?.length ? db.categories.bulkPut(categories) : Promise.resolve(),
    budgetItems?.length
      ? db.budget_items.bulkPut(budgetItems)
      : Promise.resolve(),
    assets?.length ? db.assets.bulkPut(assets) : Promise.resolve(),
    assetCategories?.length
      ? db.asset_categories.bulkPut(assetCategories)
      : Promise.resolve(),
    assetValueHistory?.length
      ? db.asset_value_history.bulkPut(assetValueHistory)
      : Promise.resolve(),
    debts?.length ? db.debts.bulkPut(debts) : Promise.resolve(),
    reports?.length ? db.reports.bulkPut(reports) : Promise.resolve(),
    snapshots?.length
      ? db.net_worth_snapshots.bulkPut(snapshots)
      : Promise.resolve(),
    activityLogs?.length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? db.activity_logs.bulkPut(activityLogs as any)
      : Promise.resolve(),
    merchantRules?.length
      ? db.merchant_rules.bulkPut(merchantRules)
      : Promise.resolve(),
    smsTransactions?.length
      ? db.sms_transactions.bulkPut(smsTransactions)
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
    await db.table(table).bulkPut(data);
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
    await db.table(table).bulkPut(data);
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
    db.id_map.clear(),
    db.sync_meta.clear(),
    db.sync_queue.clear(),
  ]);
}
