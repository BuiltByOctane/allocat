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
 * Union two protected-id maps (see buildProtectedIds). We snapshot the in-flight
 * set BOTH before and after the server fetch and union them: an item that was
 * pending when the fetch was issued but drained to `done` before the write would
 * otherwise lose protection and get clobbered by the (now-stale) server row.
 */
function unionSet(
  a: Set<string> | undefined,
  b: Set<string> | undefined,
): Set<string> | undefined {
  if (!a) return b;
  if (!b) return a;
  const out = new Set(a);
  b.forEach((x) => out.add(x));
  return out;
}

export function unionProtected(
  a: Map<string, Set<string>>,
  b: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const src of [a, b]) {
    for (const [table, ids] of src) {
      const set = out.get(table) ?? new Set<string>();
      ids.forEach((id) => set.add(id));
      out.set(table, set);
    }
  }
  return out;
}

/**
 * Tables we pull in FULL from the server (no `.limit()`), so their payload is
 * authoritative and a local row absent from it was deleted server-side / on
 * another device. Delete-reconciliation is safe ONLY for these — truncated
 * tables (asset_value_history, net_worth_snapshots, activity_logs,
 * sms_transactions, feedback) would wrongly delete rows past the limit.
 */
const RECONCILE_DELETE_TABLES = new Set([
  "profiles",
  "budgets",
  "categories",
  "budget_items",
  "assets",
  "asset_categories",
  "debts",
  "reports",
  "merchant_rules",
  "sms_blocklist",
]);

/**
 * Propagate server-side deletions into IDB: remove local rows whose id is NOT in
 * the (full) server payload, skipping rows that are protected (an in-flight local
 * mutation targets them) or `temp_` (an un-synced local INSERT not yet on the
 * server). A `null`/`undefined` payload means the fetch failed — leave locals
 * untouched. An empty array is a valid "all rows deleted" signal.
 */
/**
 * Pure delete-selection: local ids to remove given the authoritative server id
 * set. Never touches `temp_` ids (un-synced local INSERTs) or protected ids
 * (in-flight local mutations). Exported for unit testing.
 */
export function selectRowsToDelete(
  localIds: string[],
  serverIds: Set<string>,
  protectedIds: Set<string> | undefined,
): string[] {
  return localIds.filter(
    (id) =>
      typeof id === "string" &&
      !id.startsWith("temp_") &&
      !protectedIds?.has(id) &&
      !serverIds.has(id),
  );
}

async function reconcileDeletes(
  table: string,
  serverRows: Array<{ id: string }> | null | undefined,
  protectedIds: Set<string> | undefined,
): Promise<void> {
  if (!serverRows) return;
  const db = getDB();
  const serverIds = new Set(serverRows.map((r) => r.id));
  const locals = (await db.table(table).toArray()) as Array<{ id: string }>;
  const toDelete = selectRowsToDelete(
    locals.map((r) => r.id),
    serverIds,
    protectedIds,
  );
  if (toDelete.length) await db.table(table).bulkDelete(toDelete);
}

/**
 * Fast, network-free check: can we render straight from the IDB cache?
 *
 * True only when the LOCAL session user matches the userId stamped in IDB AND
 * the cache is actually populated. `getSession()` reads the persisted session
 * from local storage (no network round-trip, unlike `getUser()`), so this
 * resolves in milliseconds. The caller renders from cache immediately and
 * kicks off `hydrateAllTables()` in the background to reconcile with the server.
 *
 * The userId match is what keeps this safe on a shared device: a different user
 * (or no cached user) returns false → the caller takes the cold path, where
 * `hydrateAllTables` does the authoritative `getUser()` + wipe-if-mismatch.
 */
export async function canHydrateFromCache(): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return false;

    const db = getDB();
    const storedMeta = await db.sync_meta.get(USER_META_KEY);
    if (!storedMeta?.userId || storedMeta.userId !== session.user.id) return false;

    // A populated profiles row means this user has been fully hydrated before.
    return (await db.profiles.count()) > 0;
  } catch {
    return false;
  }
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

  // Snapshot in-flight protected ids BEFORE the fetch (union'd with the post-fetch
  // snapshot below to cover items that drain during the fetch window).
  const protectedPre = await buildProtectedIds();

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
    { data: feedback },
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
    supabase
      .from("feedback")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const now = Date.now();

  // Protect optimistic-but-unsynced local rows from being clobbered by the
  // blanket server pull (see buildProtectedIds). Rows whose id has an in-flight
  // mutation are filtered OUT of the bulkPut below; the pending sync reconciles
  // them. (temp_ rows aren't in the server payload, so they survive regardless.)
  const protectedIds = unionProtected(protectedPre, await buildProtectedIds());
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
    feedback?.length ? db.feedback.bulkPut(feedback) : Promise.resolve(),
  ]);

  // Propagate server-side deletions: for full-pull tables only, drop local rows
  // no longer present on the server (bulkPut alone can never remove a row).
  await Promise.all([
    reconcileDeletes("profiles", profiles, protectedIds.get("profiles")),
    reconcileDeletes("budgets", budgets, protectedIds.get("budgets")),
    reconcileDeletes("categories", categories, protectedIds.get("categories")),
    reconcileDeletes(
      "budget_items",
      budgetItems,
      protectedIds.get("budget_items"),
    ),
    reconcileDeletes("assets", assets, protectedIds.get("assets")),
    reconcileDeletes(
      "asset_categories",
      assetCategories,
      protectedIds.get("asset_categories"),
    ),
    reconcileDeletes("debts", debts, protectedIds.get("debts")),
    reconcileDeletes("reports", reports, protectedIds.get("reports")),
    reconcileDeletes(
      "merchant_rules",
      merchantRules,
      protectedIds.get("merchant_rules"),
    ),
    reconcileDeletes(
      "sms_blocklist",
      smsBlocklist,
      protectedIds.get("sms_blocklist"),
    ),
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
    "feedback",
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

  const protectedPre = (await buildProtectedIds()).get(table);
  const query = supabase.from(table).select("*").eq("user_id", user.id);

  const { data } = await query;
  // Same protection as hydrateAllTables — never overwrite a row with an
  // in-flight local mutation queued against it (union pre+post fetch snapshots).
  const protectedIds = unionSet(protectedPre, (await buildProtectedIds()).get(table));
  if (data?.length) {
    await db.table(table).bulkPut(filterProtected(data, protectedIds));
  }
  if (RECONCILE_DELETE_TABLES.has(table)) {
    await reconcileDeletes(table, data, protectedIds);
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
  const protectedPre = (await buildProtectedIds()).get(table);
  const { data } = await supabase.from(table).select("*").eq("user_id", user.id);
  // Same protection as hydrateAllTables — never overwrite a row with an
  // in-flight local mutation queued against it (union pre+post fetch snapshots).
  const protectedIds = unionSet(protectedPre, (await buildProtectedIds()).get(table));
  if (data?.length) {
    await db.table(table).bulkPut(filterProtected(data, protectedIds));
  }
  if (RECONCILE_DELETE_TABLES.has(table)) {
    await reconcileDeletes(table, data, protectedIds);
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
    db.feedback.clear(),
    db.id_map.clear(),
    db.sync_meta.clear(),
    db.sync_queue.clear(),
    db.notifications.clear(),
  ]);
}
