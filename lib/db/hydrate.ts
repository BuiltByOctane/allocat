import { createClient } from "@/lib/supabase/client";
import { getDB } from "./index";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const USER_META_KEY = "__userId__";

/**
 * Bumped by `clearDB()` (logout / account switch). A pull that started before
 * the wipe carries the old generation; every write phase re-checks it and bails
 * out, so a slow in-flight hydrate can never resurrect the previous user's rows
 * into a freshly cleared IDB. There is no request-level abort here on purpose:
 * the fetch may already be in flight, the guard is about never *writing* stale
 * data.
 */
let dbGeneration = 0;

/** True when the wipe generation moved since `gen` was captured. */
function isStale(gen: number): boolean {
  return gen !== dbGeneration;
}

/**
 * Current user id WITHOUT a network round trip.
 *
 * `auth.getUser()` calls Supabase Auth (`/auth/v1/user`) every time — used per
 * table refresh it doubled the request count of every reconcile. `getSession()`
 * reads the persisted session locally (it only hits the network when the token
 * actually needs refreshing). RLS is what enforces ownership server-side; the
 * id here only shapes the query, so a locally-read id is sufficient.
 */
async function localUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

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
 * Minimal structural view of a PostgREST query builder.
 *
 * The table name is dynamic here (one code path pulls all 15), so the generated
 * per-table types cannot apply. Rows are re-typed on write by Dexie.
 */
interface Queryable {
  select(columns: string): Queryable;
  eq(column: string, value: unknown): Queryable;
  gte(column: string, value: unknown): Queryable;
  order(column: string, opts: { ascending: boolean }): Queryable;
  limit(count: number): Queryable;
  then<T>(
    onfulfilled: (value: {
      data: Array<Record<string, unknown>> | null;
    }) => T,
  ): Promise<T>;
}

function queryClient(): { from(table: string): Queryable } {
  return createClient() as unknown as { from(table: string): Queryable };
}

/** How one table is pulled and reconciled. */
interface TableSpec {
  table: string;
  /** Column carrying the owner id — `profiles` is keyed by `id`. */
  ownerColumn: "user_id" | "id";
  /**
   * Truncation for the FIRST pull only (there is no watermark yet, so the whole
   * history would come down). Later pulls are deltas and need no cap.
   */
  firstPull?: { orderBy: string; ascending: boolean; limit: number };
  /**
   * Whether an id sweep can prove a local row was deleted server-side. True only
   * for tables we pull in full: for a truncated table a missing id usually just
   * means "older than the cap".
   */
  reconcileDeletes: boolean;
}

const TABLE_SPECS: TableSpec[] = [
  { table: "profiles", ownerColumn: "id", reconcileDeletes: true },
  { table: "budgets", ownerColumn: "user_id", reconcileDeletes: true },
  { table: "categories", ownerColumn: "user_id", reconcileDeletes: true },
  { table: "budget_items", ownerColumn: "user_id", reconcileDeletes: true },
  { table: "assets", ownerColumn: "user_id", reconcileDeletes: true },
  { table: "asset_categories", ownerColumn: "user_id", reconcileDeletes: true },
  {
    table: "asset_value_history",
    ownerColumn: "user_id",
    firstPull: { orderBy: "entry_date", ascending: false, limit: 500 },
    reconcileDeletes: false,
  },
  { table: "debts", ownerColumn: "user_id", reconcileDeletes: true },
  { table: "reports", ownerColumn: "user_id", reconcileDeletes: true },
  {
    table: "net_worth_snapshots",
    ownerColumn: "user_id",
    firstPull: { orderBy: "snapshot_date", ascending: true, limit: 24 },
    reconcileDeletes: false,
  },
  {
    table: "activity_logs",
    ownerColumn: "user_id",
    firstPull: { orderBy: "created_at", ascending: false, limit: 200 },
    reconcileDeletes: false,
  },
  { table: "merchant_rules", ownerColumn: "user_id", reconcileDeletes: true },
  {
    table: "sms_transactions",
    ownerColumn: "user_id",
    firstPull: { orderBy: "created_at", ascending: false, limit: 200 },
    reconcileDeletes: false,
  },
  { table: "sms_blocklist", ownerColumn: "user_id", reconcileDeletes: true },
  {
    table: "feedback",
    ownerColumn: "user_id",
    firstPull: { orderBy: "created_at", ascending: false, limit: 100 },
    reconcileDeletes: false,
  },
];

const SPEC_BY_TABLE = new Map(TABLE_SPECS.map((s) => [s.table, s]));

/**
 * The watermark to store after a pull: the newest server `updated_at` seen,
 * never older than the one we already had.
 *
 * Server values only — a client clock that runs fast would otherwise skip rows
 * written in between. A row with no usable timestamp (a table that predates the
 * delta migration) simply leaves the watermark alone, which keeps that table on
 * full pulls instead of silently pulling nothing. Exported for unit testing.
 */
export function selectDeltaWatermark(
  rows: Array<Record<string, unknown>>,
  previous: string | undefined,
): string | undefined {
  let best = previous;
  let bestMs = previous ? Date.parse(previous) : Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const raw = row.updated_at;
    if (typeof raw !== "string") continue;
    const ms = Date.parse(raw);
    if (Number.isNaN(ms) || ms <= bestMs) continue;
    best = raw;
    bestMs = ms;
  }
  return best;
}

/**
 * Pull one table: the rows changed since its watermark, plus — for full-payload
 * tables — an id-only sweep so server-side deletions still propagate (a delta
 * can never mention a row that no longer exists).
 *
 * Degrades safely on a database that predates the delta migration: without an
 * `updated_at` column no watermark is ever stored, so the pull stays exactly as
 * wide as it was before.
 */
async function pullTable(
  spec: TableSpec,
  userId: string,
  gen: number,
  protectedPre: Map<string, Set<string>>,
): Promise<void> {
  const db = getDB();
  const sb = queryClient();

  const meta = await db.sync_meta.get(spec.table);
  const watermark = meta?.watermark;

  let rowQuery = sb.from(spec.table).select("*").eq(spec.ownerColumn, userId);
  if (watermark) {
    // `gte`, not `gt`: at microsecond resolution a tie would otherwise drop a
    // row, and re-sending one row costs nothing (bulkPut is idempotent).
    rowQuery = rowQuery.gte("updated_at", watermark);
  } else if (spec.firstPull) {
    rowQuery = rowQuery
      .order(spec.firstPull.orderBy, { ascending: spec.firstPull.ascending })
      .limit(spec.firstPull.limit);
  }

  const sweepQuery = spec.reconcileDeletes
    ? sb.from(spec.table).select("id").eq(spec.ownerColumn, userId)
    : null;

  const [rowsRes, sweepRes] = await Promise.all([
    rowQuery,
    sweepQuery ?? Promise.resolve({ data: null }),
  ]);
  if (isStale(gen)) return;

  const data = rowsRes.data;
  const protectedIds = unionSet(
    protectedPre.get(spec.table),
    (await buildProtectedIds()).get(spec.table),
  );

  const rows = filterProtected(data as Array<{ id: string }> | null, protectedIds);
  if (rows.length) {
    await db.table(spec.table).bulkPut(rows as never);
  }
  if (spec.reconcileDeletes) {
    await reconcileDeletes(
      spec.table,
      sweepRes.data as Array<{ id: string }> | null,
      protectedIds,
    );
  }

  await db.sync_meta.put({
    table: spec.table,
    lastSynced: Date.now(),
    watermark: selectDeltaWatermark(data ?? [], watermark),
  });
}

/**
 * Reconciles every table for the current user into IDB. Called at app startup
 * (SyncProvider mount), on foreground/reconnect, and by pull-to-refresh.
 *
 * Each table pulls its own delta (see pullTable), so a quiet reconcile moves
 * almost no rows — it used to re-download the entire account every time.
 *
 * If the stored user ID in IDB differs from the current user (different person
 * logged in on the same device), IDB is wiped first before re-hydrating.
 */
export async function hydrateAllTables(): Promise<void> {
  // Snapshot the wipe generation: if a logout / account switch clears IDB while
  // this pull is in flight, every write phase below bails instead of writing the
  // old user's rows back into the cleared database.
  const gen = dbGeneration;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  if (isStale(gen)) return;

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

  // Snapshot in-flight protected ids BEFORE the fetches (union'd per table with
  // a post-fetch snapshot to cover items that drain during the fetch window).
  const protectedPre = await buildProtectedIds();

  await Promise.all(
    TABLE_SPECS.map((spec) =>
      pullTable(spec, userId, gen, protectedPre).catch((err) => {
        // One failing table must not abort the rest: its watermark stays put, so
        // the next reconcile simply re-asks for the same window.
        console.warn(`[hydrate] ${spec.table} pull failed:`, err);
      }),
    ),
  );
}

/** Tables the single-table refresh helpers accept. */
type RefreshableTable =
  | "budgets"
  | "categories"
  | "budget_items"
  | "assets"
  | "asset_categories"
  | "asset_value_history"
  | "debts"
  | "net_worth_snapshots"
  | "reports";

/** Pull one table by name, on behalf of the two exported helpers below. */
async function refreshOne(table: RefreshableTable): Promise<void> {
  const spec = SPEC_BY_TABLE.get(table);
  if (!spec) return;

  const gen = dbGeneration;
  const userId = await localUserId();
  if (!userId) return;

  await pullTable(spec, userId, gen, await buildProtectedIds());
}

/**
 * Force-refresh a single table regardless of staleness.
 * Use after a sync that may have triggered server-side cascades (e.g. a
 * budget_items UPDATE that cascaded into assets / debts) — the cascade bumps
 * `updated_at`, so the delta picks the changed rows up.
 */
export async function forceRefreshTable(
  table: RefreshableTable,
): Promise<void> {
  await refreshOne(table);
}

/** Wipes all user data from IDB — also called when a different user logs in. */
export async function clearDB(): Promise<void> {
  // Invalidate every pull that is already in flight (see dbGeneration).
  dbGeneration++;
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
