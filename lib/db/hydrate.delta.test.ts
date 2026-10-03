import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Delta pulls.
 *
 * A reconcile used to re-download every row of every table. Each table now
 * carries a watermark — the max server `updated_at` it has seen — and pulls
 * only what changed since. Deletions can't show up in a delta, so full-pull
 * tables also get an id-only sweep that feeds the existing delete
 * reconciliation.
 */

// ── Recorded queries ───────────────────────────────────────────────────────
interface RecordedQuery {
  table: string;
  select: string;
  filters: Array<[string, string, unknown]>;
  limit?: number;
  ordered?: string;
}

let queries: RecordedQuery[] = [];
/** `${table}:${select}` → rows the stubbed PostgREST call resolves with. */
let responses: Record<string, Array<Record<string, unknown>>> = {};

function builder(table: string) {
  const q: RecordedQuery = { table, select: "*", filters: [] };
  const api = {
    select(cols: string) {
      q.select = cols;
      return api;
    },
    eq(col: string, v: unknown) {
      q.filters.push(["eq", col, v]);
      return api;
    },
    gte(col: string, v: unknown) {
      q.filters.push(["gte", col, v]);
      return api;
    },
    order(col: string) {
      q.ordered = col;
      return api;
    },
    limit(n: number) {
      q.limit = n;
      return api;
    },
    then<T>(resolve: (value: { data: unknown }) => T) {
      queries.push(q);
      const key = `${q.table}:${q.select === "id" ? "id" : "*"}`;
      return Promise.resolve({ data: responses[key] ?? [] }).then(resolve);
    },
  };
  return api;
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "u1" } } } }),
      getUser: async () => ({ data: { user: { id: "u1" } } }),
    },
    from: (table: string) => builder(table),
    rpc: async (fn: string, args: { p_watermarks: Record<string, string> }) => {
      rpcCalls.push({ fn, watermarks: args.p_watermarks });
      // null = the RPC is missing (database predates the migration).
      return manifest
        ? { data: manifest, error: null }
        : { data: null, error: { message: "function not found" } };
    },
  }),
}));

/** What the stubbed `sync_manifest` RPC answers; null = function missing. */
let manifest: Record<string, { changed: boolean; n: number | null }> | null = null;
let rpcCalls: Array<{ fn: string; watermarks: Record<string, string> }> = [];

/** A manifest saying "nothing changed" for every table, with these counts. */
function quietManifest(counts: Record<string, number> = {}) {
  const out: Record<string, { changed: boolean; n: number | null }> = {};
  for (const t of [
    "profiles", "budgets", "categories", "budget_items", "assets",
    "asset_categories", "asset_value_history", "debts", "reports",
    "net_worth_snapshots", "activity_logs", "merchant_rules",
    "sms_transactions", "sms_blocklist", "feedback",
  ]) {
    out[t] = { changed: false, n: counts[t] ?? 0 };
  }
  return out;
}

// ── Dexie-shaped stub ──────────────────────────────────────────────────────
type Row = Record<string, unknown>;

/** Rows the stubbed `sync_queue` reports as pending/processing. */
let pendingQueue: Row[] = [];

function makeTable(pk = "id") {
  const rows: Row[] = [];
  const api = {
    rows,
    async bulkPut(incoming: Row[]) {
      for (const r of incoming) {
        const i = rows.findIndex((x) => x[pk] === r[pk]);
        if (i >= 0) rows[i] = { ...r };
        else rows.push({ ...r });
      }
    },
    async bulkDelete(ids: unknown[]) {
      for (const id of ids) {
        const i = rows.findIndex((r) => r[pk] === id);
        if (i >= 0) rows.splice(i, 1);
      }
    },
    async put(row: Row) {
      await api.bulkPut([row]);
    },
    async get(id: unknown) {
      return rows.find((r) => r[pk] === id);
    },
    async bulkGet(ids: unknown[]) {
      return ids.map((id) => rows.find((r) => r[pk] === id));
    },
    async toArray() {
      return [...rows];
    },
    async count() {
      return rows.length;
    },
    async clear() {
      rows.length = 0;
    },
    where() {
      return {
        anyOf: () => ({ toArray: async () => [] as Row[] }),
        equals: () => ({ toArray: async () => [] as Row[] }),
      };
    },
  };
  return api;
}

const tableNames = [
  "profiles", "budgets", "categories", "budget_items", "assets",
  "asset_categories", "asset_value_history", "debts", "reports",
  "net_worth_snapshots", "activity_logs", "merchant_rules", "sms_transactions",
  "sms_blocklist", "feedback", "id_map", "sync_queue", "notifications",
];

const db: Record<string, ReturnType<typeof makeTable>> & {
  table?: (n: string) => ReturnType<typeof makeTable>;
} = {};
for (const n of tableNames) db[n] = makeTable();
db.sync_meta = makeTable("table");
// sync_queue is only read for the protected-id snapshot.
db.sync_queue.where = () =>
  ({
    anyOf: () => ({ toArray: async () => pendingQueue }),
    equals: () => ({ toArray: async () => pendingQueue }),
  }) as never;
db.table = (n: string) => db[n];

vi.mock("./index", () => ({ getDB: () => db }));

const {
  hydrateAllTables,
  forceRefreshTable,
  refreshTables,
  selectDeltaWatermark,
  needsPull,
  isHydrated,
} = await import("./hydrate");

function queriesFor(table: string) {
  return queries.filter((q) => q.table === table);
}

describe("selectDeltaWatermark", () => {
  it("takes the newest server timestamp in the payload", () => {
    expect(
      selectDeltaWatermark(
        [{ updated_at: "2026-09-10T00:00:00Z" }, { updated_at: "2026-09-12T00:00:00Z" }],
        undefined,
      ),
    ).toBe("2026-09-12T00:00:00Z");
  });

  it("keeps the previous watermark when the delta is empty", () => {
    expect(selectDeltaWatermark([], "2026-09-01T00:00:00Z")).toBe(
      "2026-09-01T00:00:00Z",
    );
  });

  it("never moves backwards", () => {
    expect(
      selectDeltaWatermark(
        [{ updated_at: "2026-08-01T00:00:00Z" }],
        "2026-09-01T00:00:00Z",
      ),
    ).toBe("2026-09-01T00:00:00Z");
  });

  it("ignores rows without a usable timestamp", () => {
    expect(selectDeltaWatermark([{ id: "x" }], undefined)).toBeUndefined();
  });
});

describe("hydrate delta pulls", () => {
  beforeEach(async () => {
    queries = [];
    responses = {};
    pendingQueue = [];
    manifest = null;
    rpcCalls = [];
    for (const n of [...tableNames, "sync_meta"]) await db[n].clear();
  });

  it("first pull has no watermark filter and stores one", async () => {
    responses["budgets:*"] = [
      { id: "b1", user_id: "u1", updated_at: "2026-09-11T10:00:00Z" },
      { id: "b2", user_id: "u1", updated_at: "2026-09-12T10:00:00Z" },
    ];
    responses["budgets:id"] = [{ id: "b1" }, { id: "b2" }];

    await hydrateAllTables();

    const [q] = queriesFor("budgets");
    expect(q.filters.some(([op]) => op === "gte")).toBe(false);
    expect(db.budgets.rows).toHaveLength(2);
    const meta = await db.sync_meta.get("budgets");
    expect(meta?.watermark).toBe("2026-09-12T10:00:00Z");
  });

  it("second pull asks only for rows changed since the watermark", async () => {
    responses["budgets:*"] = [
      { id: "b1", user_id: "u1", updated_at: "2026-09-12T10:00:00Z" },
    ];
    responses["budgets:id"] = [{ id: "b1" }];
    await hydrateAllTables();

    queries = [];
    responses["budgets:*"] = [
      { id: "b1", user_id: "u1", total_budget: 999, updated_at: "2026-09-13T10:00:00Z" },
    ];
    await hydrateAllTables();

    const [q] = queriesFor("budgets");
    expect(q.filters).toContainEqual(["gte", "updated_at", "2026-09-12T10:00:00Z"]);
    // The changed row was merged, not duplicated.
    expect(db.budgets.rows).toHaveLength(1);
    expect(db.budgets.rows[0].total_budget).toBe(999);
    expect((await db.sync_meta.get("budgets"))?.watermark).toBe(
      "2026-09-13T10:00:00Z",
    );
  });

  it("an empty delta keeps the rows and the watermark", async () => {
    responses["budgets:*"] = [
      { id: "b1", user_id: "u1", updated_at: "2026-09-12T10:00:00Z" },
    ];
    responses["budgets:id"] = [{ id: "b1" }];
    await hydrateAllTables();

    responses["budgets:*"] = [];
    await hydrateAllTables();

    expect(db.budgets.rows).toHaveLength(1);
    expect((await db.sync_meta.get("budgets"))?.watermark).toBe(
      "2026-09-12T10:00:00Z",
    );
  });

  it("propagates deletions through the id-only sweep", async () => {
    responses["budgets:*"] = [
      { id: "b1", user_id: "u1", updated_at: "2026-09-12T10:00:00Z" },
      { id: "b2", user_id: "u1", updated_at: "2026-09-12T10:00:00Z" },
    ];
    responses["budgets:id"] = [{ id: "b1" }, { id: "b2" }];
    await hydrateAllTables();
    expect(db.budgets.rows).toHaveLength(2);

    // b2 deleted on another device: it is absent from the sweep, and a delta
    // could never have told us about it.
    queries = [];
    responses["budgets:*"] = [];
    responses["budgets:id"] = [{ id: "b1" }];
    await hydrateAllTables();

    expect(db.budgets.rows.map((r) => r.id)).toEqual(["b1"]);
    // The sweep is id-only — that is what makes it cheap.
    expect(queriesFor("budgets").some((q) => q.select === "id")).toBe(true);
  });

  it("never deletes a row with an in-flight local mutation", async () => {
    responses["budgets:*"] = [
      { id: "b1", user_id: "u1", updated_at: "2026-09-12T10:00:00Z" },
    ];
    responses["budgets:id"] = [{ id: "b1" }];
    await hydrateAllTables();

    // The user created a budget offline; its INSERT has not drained yet, so the
    // server sweep cannot know about it.
    await db.budgets.bulkPut([{ id: "local-1", user_id: "u1" }]);
    pendingQueue = [
      { table: "budgets", recordId: "local-1", status: "pending" },
    ];

    responses["budgets:*"] = [];
    responses["budgets:id"] = [{ id: "b1" }];
    await hydrateAllTables();

    expect(db.budgets.rows.map((r) => r.id).sort()).toEqual(["b1", "local-1"]);
  });

  it("does not sweep truncated tables (rows past the limit are not deletions)", async () => {
    await hydrateAllTables();
    expect(queriesFor("activity_logs").every((q) => q.select === "*")).toBe(true);
    expect(queriesFor("sms_transactions").every((q) => q.select === "*")).toBe(true);
  });

  it("truncates only the FIRST pull of a capped table", async () => {
    responses["sms_transactions:*"] = [
      { id: "s1", user_id: "u1", updated_at: "2026-09-12T10:00:00Z" },
    ];
    await hydrateAllTables();
    expect(queriesFor("sms_transactions")[0].limit).toBe(200);

    queries = [];
    await hydrateAllTables();
    const second = queriesFor("sms_transactions")[0];
    expect(second.limit).toBeUndefined();
    expect(second.filters).toContainEqual([
      "gte",
      "updated_at",
      "2026-09-12T10:00:00Z",
    ]);
  });

  it("forceRefreshTable pulls the same delta and sweep for one table", async () => {
    responses["assets:*"] = [
      { id: "a1", user_id: "u1", updated_at: "2026-09-12T10:00:00Z" },
    ];
    responses["assets:id"] = [{ id: "a1" }];
    await forceRefreshTable("assets");

    queries = [];
    responses["assets:*"] = [];
    responses["assets:id"] = [];
    await forceRefreshTable("assets");

    expect(queriesFor("assets")[0].filters).toContainEqual([
      "gte",
      "updated_at",
      "2026-09-12T10:00:00Z",
    ]);
    // Server says the account has no assets left → the local row goes.
    expect(db.assets.rows).toHaveLength(0);
  });
});

describe("needsPull", () => {
  const quiet = { changed: false, n: 2 };
  it("pulls a table that was never pulled", () => {
    expect(needsPull({ hasMeta: false, entry: quiet, reconcileDeletes: true, localCount: 2 })).toBe(true);
  });
  it("pulls when the manifest has no entry for the table", () => {
    expect(needsPull({ hasMeta: true, entry: undefined, reconcileDeletes: true, localCount: 2 })).toBe(true);
  });
  it("pulls when a row changed after the watermark", () => {
    expect(needsPull({ hasMeta: true, entry: { changed: true, n: 2 }, reconcileDeletes: false, localCount: 0 })).toBe(true);
  });
  it("pulls a full-payload table whose count drifted (a deletion)", () => {
    expect(needsPull({ hasMeta: true, entry: { changed: false, n: 1 }, reconcileDeletes: true, localCount: 2 })).toBe(true);
  });
  it("skips an unchanged table with matching count", () => {
    expect(needsPull({ hasMeta: true, entry: quiet, reconcileDeletes: true, localCount: 2 })).toBe(false);
  });
  it("ignores count on truncated tables", () => {
    expect(needsPull({ hasMeta: true, entry: { changed: false, n: null }, reconcileDeletes: false, localCount: 5 })).toBe(false);
  });
});

describe("manifest-driven reconcile", () => {
  beforeEach(async () => {
    queries = [];
    responses = {};
    pendingQueue = [];
    manifest = null;
    rpcCalls = [];
    for (const n of [...tableNames, "sync_meta"]) await db[n].clear();
  });

  async function seed() {
    responses["budgets:*"] = [
      { id: "b1", user_id: "u1", updated_at: "2026-09-12T10:00:00Z" },
      { id: "b2", user_id: "u1", updated_at: "2026-09-12T10:00:00Z" },
    ];
    responses["budgets:id"] = [{ id: "b1" }, { id: "b2" }];
    await hydrateAllTables();
    queries = [];
    rpcCalls = [];
  }

  it("first launch skips the manifest and pulls everything", async () => {
    manifest = quietManifest();
    await hydrateAllTables();
    expect(rpcCalls).toHaveLength(0);
    expect(queriesFor("budgets").length).toBeGreaterThan(0);
  });

  it("a quiet reconcile is ONE request and pulls nothing", async () => {
    await seed();
    manifest = quietManifest({ budgets: 2 });
    await hydrateAllTables();

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].watermarks.budgets).toBe("2026-09-12T10:00:00Z");
    expect(queries).toHaveLength(0);
  });

  it("pulls only the table the manifest flags as changed", async () => {
    await seed();
    manifest = { ...quietManifest({ budgets: 2 }), debts: { changed: true, n: 1 } };
    responses["debts:*"] = [{ id: "d1", user_id: "u1", updated_at: "2026-10-01T00:00:00Z" }];
    responses["debts:id"] = [{ id: "d1" }];
    await hydrateAllTables();

    expect(new Set(queries.map((q) => q.table))).toEqual(new Set(["debts"]));
    expect(db.debts.rows).toHaveLength(1);
  });

  it("a count drift triggers the sweep that removes the deleted row", async () => {
    await seed();
    manifest = quietManifest({ budgets: 1 });
    responses["budgets:*"] = [];
    responses["budgets:id"] = [{ id: "b1" }];
    await hydrateAllTables();

    expect(db.budgets.rows.map((r) => r.id)).toEqual(["b1"]);
  });

  it("an un-synced temp_ row does not count as drift", async () => {
    await seed();
    await db.budgets.bulkPut([{ id: "temp_x", user_id: "u1" }]);
    manifest = quietManifest({ budgets: 2 });
    await hydrateAllTables();
    expect(queries).toHaveLength(0);
  });

  it("falls back to a full reconcile when the RPC is missing", async () => {
    await seed();
    manifest = null;
    await hydrateAllTables();
    expect(queriesFor("budgets").length).toBeGreaterThan(0);
    expect(queriesFor("profiles").length).toBeGreaterThan(0);
  });

  it("concurrent calls share one run", async () => {
    await seed();
    manifest = quietManifest({ budgets: 2 });
    await Promise.all([hydrateAllTables(), hydrateAllTables()]);
    expect(rpcCalls).toHaveLength(1);
  });

  it("refreshTables pulls only the cascaded tables that changed", async () => {
    await seed();
    manifest = { ...quietManifest({ budgets: 2 }), assets: { changed: true, n: 0 } };
    await refreshTables(["assets", "debts", "budgets"]);
    expect(new Set(queries.map((q) => q.table))).toEqual(new Set(["assets"]));
  });

  it("isHydrated is true for a pulled-but-empty table", async () => {
    expect(await isHydrated("debts")).toBe(false);
    await hydrateAllTables();
    expect(db.debts.rows).toHaveLength(0);
    expect(await isHydrated("debts")).toBe(true);
  });
});
