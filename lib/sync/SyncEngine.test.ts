import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SyncQueueItem } from "@/lib/db";

/**
 * SyncEngine queue-drain tests.
 *
 * The engine must drain INDEPENDENT queue items concurrently (bounded pool)
 * while preserving two ordering guarantees:
 *   - producer→dependent: an item referencing a temp id waits until the INSERT
 *     that creates it has written id_map;
 *   - same-record: two ops on the same (table, recordId) never overlap and keep
 *     insertion order.
 *
 * No fake-indexeddb in this repo (see ingestClient.test.ts), so getDB() is a
 * faithful in-memory Dexie-shaped stub. The batch-selection / backoff / id_map
 * logic exercised here is the REAL SyncEngine code; only storage + the single
 * server-action round trip (executeItem) are stubbed via a subclass seam.
 */

// ── In-memory Dexie-shaped stub ────────────────────────────────────────────
type Row = Record<string, unknown> & { id?: string | number };

function makeTable(pk: string) {
  const rows: Row[] = [];
  let auto = 0;

  const matchField = (field: string, pred: (v: unknown) => boolean) =>
    rows.filter((r) => pred(r[field]));

  function collection(subset: Row[]) {
    return {
      async toArray() {
        return [...subset];
      },
      async sortBy(key: string) {
        return [...subset].sort(
          (a, b) => (a[key] as number) - (b[key] as number)
        );
      },
      async count() {
        return subset.length;
      },
      async first() {
        return subset[0];
      },
      async modify(changes: Record<string, unknown>) {
        for (const r of subset) Object.assign(r, changes);
        return subset.length;
      },
    };
  }

  const table = {
    rows,
    where(field: string) {
      return {
        equals(value: unknown) {
          return collection(matchField(field, (v) => v === value));
        },
        anyOf(values: unknown[]) {
          const set = new Set(values);
          return collection(matchField(field, (v) => set.has(v)));
        },
      };
    },
    filter(fn: (r: Row) => boolean) {
      return collection(rows.filter(fn));
    },
    async add(row: Row) {
      const r = { ...row };
      if (pk === "id" && r.id === undefined) r.id = ++auto;
      rows.push(r);
      return r.id;
    },
    async put(row: Row) {
      const idx = rows.findIndex((r) => r[pk] === row[pk]);
      if (idx >= 0) rows[idx] = { ...row };
      else rows.push({ ...row });
      return row[pk];
    },
    async get(id: unknown) {
      return rows.find((r) => r[pk] === id);
    },
    async update(id: unknown, changes: Record<string, unknown>) {
      const r = rows.find((x) => x[pk] === id);
      if (r) Object.assign(r, changes);
      return r ? 1 : 0;
    },
    async delete(id: unknown) {
      const idx = rows.findIndex((r) => r[pk] === id);
      if (idx >= 0) rows.splice(idx, 1);
    },
    async toArray() {
      return [...rows];
    },
    async count() {
      return rows.length;
    },
  };
  return table;
}

type Stub = ReturnType<typeof makeTable>;

const tables: Record<string, Stub> = {};
function resetDB() {
  for (const k of Object.keys(tables)) delete tables[k];
  const names = [
    "sync_queue",
    "id_map",
    "budgets",
    "categories",
    "budget_items",
    "assets",
    "debts",
    "asset_categories",
    "reports",
    "sms_transactions",
    "sync_meta",
  ];
  for (const n of names)
    tables[n] = makeTable(
      n === "sync_queue" ? "id" : n === "id_map" ? "tempId" : n === "sync_meta" ? "table" : "id"
    );
}

// SyncEngine statically imports server actions that pull the Next-only
// `server-only` shim; stub it (executeItem is overridden, so they never run).
vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  getDB: () => ({
    ...tables,
    table: (name: string) => tables[name],
  }),
}));

// Import AFTER the mock is registered.
const { SyncEngine } = await import("./SyncEngine");

// ── Test harness ───────────────────────────────────────────────────────────
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitFor(pred: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await delay(5);
  }
}

interface ExecOptions {
  /** ms each executeItem "round trip" takes */
  latency?: number;
  /** tempId → realId to return for INSERTs */
  realIds?: Record<string, string>;
  /** recordIds whose executeItem should always throw */
  failRecordIds?: Set<string>;
  /** recordId → canned result (e.g. a CARRY_SETUP server response) */
  results?: Record<string, unknown>;
  /** make the whole bulk round trip throw */
  failBatch?: boolean;
}

type BatchOutcome = { ok: true; result: unknown } | { ok: false; error: string };

class TestEngine extends (SyncEngine as unknown as {
  new (): {
    processQueue(): Promise<void>;
    stop(): void;
    setCallbacks(cbs: unknown): void;
    executeItem(item: SyncQueueItem, payload: unknown): Promise<unknown>;
    executeBatch(
      items: SyncQueueItem[],
      payloads: unknown[],
    ): Promise<BatchOutcome[]>;
    retryDelayMs(retries: number): number;
  };
}) {
  /** One entry per bulk round trip: the recordIds it carried. */
  batchCalls: string[][] = [];
  active = 0;
  maxActive = 0;
  order: string[] = [];
  overlaps: Record<string, number> = {};
  recordActive: Record<string, number> = {};
  resolvedPayloads: Record<string, unknown> = {};
  opts: ExecOptions;

  constructor(opts: ExecOptions = {}) {
    super();
    this.opts = opts;
  }

  // Small backoff so retry tests don't wait real seconds.
  retryDelayMs(): number {
    return 10;
  }

  async executeBatch(
    items: SyncQueueItem[],
    payloads: unknown[],
  ): Promise<BatchOutcome[]> {
    this.batchCalls.push(items.map((i) => i.recordId));
    await delay(this.opts.latency ?? 20);
    if (this.opts.failBatch) throw new Error("bulk round trip failed");
    return items.map((item, i) => {
      this.resolvedPayloads[item.recordId] = payloads[i];
      if (this.opts.failRecordIds?.has(item.recordId)) {
        return { ok: false as const, error: "simulated item failure" };
      }
      const realId = item.tempId ? this.opts.realIds?.[item.tempId] : undefined;
      return {
        ok: true as const,
        result: { id: realId ?? item.recordId, resolved: payloads[i] },
      };
    });
  }

  async executeItem(item: SyncQueueItem, payload: unknown): Promise<unknown> {
    const key = `${item.table}:${item.recordId}`;
    this.active++;
    this.recordActive[key] = (this.recordActive[key] ?? 0) + 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    this.overlaps[key] = Math.max(this.overlaps[key] ?? 0, this.recordActive[key]);
    this.order.push(`${item.operation}:${item.recordId}#${item.id}`);
    this.resolvedPayloads[item.recordId] = payload;
    try {
      await delay(this.opts.latency ?? 20);
      if (this.opts.failRecordIds?.has(item.recordId)) {
        throw new Error("simulated failure");
      }
      if (this.opts.results && item.recordId in this.opts.results) {
        return this.opts.results[item.recordId];
      }
      if (item.operation === "INSERT" && item.tempId) {
        const realId = this.opts.realIds?.[item.tempId];
        return { id: realId ?? item.tempId, resolved: payload };
      }
      return { resolved: payload };
    } finally {
      this.active--;
      this.recordActive[key]--;
    }
  }
}

function seed(items: Array<Partial<SyncQueueItem>>) {
  items.forEach((it, i) => {
    tables.sync_queue.rows.push({
      id: i + 1,
      table: "reports",
      operation: "UPDATE",
      recordId: `r${i}`,
      payload: {},
      retries: 0,
      status: "pending",
      createdAt: i,
      ...it,
    } as Row);
  });
}

describe("SyncEngine concurrent drain", () => {
  beforeEach(() => {
    resetDB();
    vi.stubGlobal("navigator", { onLine: true });
  });

  it("drains independent items concurrently (bounded pool)", async () => {
    seed([
      { recordId: "a" },
      { recordId: "b" },
      { recordId: "c" },
      { recordId: "d" },
    ]);
    const engine = new TestEngine({ latency: 30 });

    await engine.processQueue();

    // All four independent → they must overlap, not run one-at-a-time.
    expect(engine.maxActive).toBeGreaterThan(1);
    // …but bounded by the concurrency cap (4).
    expect(engine.maxActive).toBeLessThanOrEqual(4);
    // Everything drained.
    const remaining = tables.sync_queue.rows.filter(
      (r) => r.status === "pending" || r.status === "processing"
    );
    expect(remaining).toHaveLength(0);
  });

  it("serializes ops on the same record and preserves insertion order", async () => {
    // Three ops on ONE record — must never overlap, must run oldest→newest.
    seed([
      { recordId: "x", operation: "UPDATE", createdAt: 0 },
      { recordId: "x", operation: "UPDATE", createdAt: 1 },
      { recordId: "x", operation: "DELETE", createdAt: 2 },
    ]);
    const engine = new TestEngine({ latency: 15 });

    await engine.processQueue();

    expect(engine.overlaps["reports:x"]).toBe(1); // never concurrent
    expect(engine.order).toEqual([
      "UPDATE:x#1",
      "UPDATE:x#2",
      "DELETE:x#3",
    ]);
  });

  it("runs a dependent only after its producer INSERT maps the temp id", async () => {
    // categories INSERT (temp_c) → budget_items INSERT referencing temp_c.
    tables.categories.rows.push({ id: "temp_c", name: "cat" });
    tables.budget_items.rows.push({ id: "temp_i", category_id: "temp_c" });
    seed([
      {
        table: "categories",
        operation: "INSERT",
        recordId: "temp_c",
        tempId: "temp_c",
        payload: {},
        createdAt: 0,
      },
      {
        table: "budget_items",
        operation: "INSERT",
        recordId: "temp_i",
        tempId: "temp_i",
        payload: { categoryId: "temp_c" },
        createdAt: 1,
      },
    ]);
    const engine = new TestEngine({
      latency: 10,
      realIds: { temp_c: "real_c", temp_i: "real_i" },
    });

    await engine.processQueue();

    // Producer ran first; dependent ran after and never overlapped it.
    expect(engine.order).toEqual(["INSERT:temp_c#1", "INSERT:temp_i#2"]);
    // Dependent's temp id was resolved to the real id before dispatch.
    expect(
      (engine.resolvedPayloads["temp_i"] as { categoryId: string }).categoryId
    ).toBe("real_c");
    // Dependent succeeded (not blocked/failed).
    const dep = tables.sync_queue.rows.find((r) => r.recordId === "temp_i");
    expect(dep?.status).toBe("done");
  });

  it("retries a failing item with backoff without blocking others, then rolls back", async () => {
    const rolledBack: string[] = [];
    tables.assets.rows.push({ id: "temp_f" });
    seed([
      {
        table: "assets",
        operation: "INSERT",
        recordId: "temp_f",
        tempId: "temp_f",
        payload: {},
        createdAt: 0,
      },
      { table: "reports", operation: "UPDATE", recordId: "ok", createdAt: 1 },
    ]);
    const engine = new TestEngine({
      latency: 5,
      failRecordIds: new Set(["temp_f"]),
    });
    engine.setCallbacks({
      onRollback: (item: SyncQueueItem) => rolledBack.push(item.recordId),
    });

    await engine.processQueue();

    // Independent good item drained on the first pass — not blocked by the failure.
    const ok = tables.sync_queue.rows.find((r) => r.recordId === "ok");
    expect(ok?.status).toBe("done");

    // Failing item retries on backoff timers → eventually permanently failed.
    await waitFor(
      () =>
        tables.sync_queue.rows.find((r) => r.recordId === "temp_f")?.status ===
        "failed"
    );
    expect(rolledBack).toEqual(["temp_f"]); // rollback fired once
    expect(tables.assets.rows.find((r) => r.id === "temp_f")).toBeUndefined(); // optimistic row removed
  });

  it("reports pending count reaching zero after a batch drains", async () => {
    const counts: number[] = [];
    seed([{ recordId: "a" }, { recordId: "b" }, { recordId: "c" }]);
    const engine = new TestEngine({ latency: 10 });
    engine.setCallbacks({ onPendingChange: (n: number) => counts.push(n) });

    await engine.processQueue();

    expect(counts.at(-1)).toBe(0);
  });
});

// ── CARRY_SETUP reconciliation ─────────────────────────────────────────────

function carryPayload(overrides: Record<string, unknown> = {}) {
  return {
    month: 7,
    year: 2026,
    budgetTempId: "temp_b",
    budgetId: null,
    sourceBudgetId: "b-jun",
    totalBudget: 50000,
    templateId: "carry:x",
    mintedTemplateId: true,
    categories: [
      {
        tempId: "temp_c1",
        name: "Needs",
        icon: null,
        color: null,
        type: "misc",
        allocated_amount: 25000,
        items: [
          {
            tempId: "temp_i1",
            name: "Rent",
            emoji: null,
            planned: 18000,
            linkType: null,
            linkId: null,
            templateItemId: "tid-1",
            stampSourceItemId: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function seedCarryOptimisticRows() {
  tables.budgets.rows.push({ id: "temp_b", month: 7, year: 2026, total_budget: 50000 });
  tables.categories.rows.push({ id: "temp_c1", budget_id: "temp_b", name: "Needs" });
  tables.budget_items.rows.push({ id: "temp_i1", category_id: "temp_c1", name: "Rent" });
  tables.sync_meta.rows.push({ table: "__carry__2026-7", lastSynced: 1, state: "carried" });
}

describe("SyncEngine CARRY_SETUP", () => {
  beforeEach(() => {
    resetDB();
    vi.stubGlobal("navigator", { onLine: true });
  });

  it("reconciles a successful carry: budget temp swap, FK rewrites, nested maps", async () => {
    seedCarryOptimisticRows();
    seed([
      {
        table: "budgets",
        operation: "CARRY_SETUP",
        recordId: "temp_b",
        payload: carryPayload(),
        createdAt: 0,
      },
    ]);
    const engine = new TestEngine({
      latency: 5,
      results: {
        temp_b: {
          conflict: false,
          budgetIdMap: {
            tempId: "temp_b",
            realId: "real_b",
            record: { id: "real_b", month: 7, year: 2026, total_budget: 50000, template_id: "carry:x" },
          },
          categoryIdMap: [
            { tempId: "temp_c1", realId: "real_c1", record: { id: "real_c1", budget_id: "real_b", name: "Needs" } },
          ],
          itemIdMap: [
            { tempId: "temp_i1", realId: "real_i1", record: { id: "real_i1", category_id: "real_c1", name: "Rent" } },
          ],
        },
      },
    });

    await engine.processQueue();

    const q = tables.sync_queue.rows[0];
    expect(q.status).toBe("done");
    // Budget temp row swapped for the real one.
    expect(tables.budgets.rows.map((r) => r.id)).toEqual(["real_b"]);
    // id_map entries written for all three levels.
    const mapped = Object.fromEntries(tables.id_map.rows.map((r) => [r.tempId, r.realId]));
    expect(mapped).toMatchObject({ temp_b: "real_b", temp_c1: "real_c1", temp_i1: "real_i1" });
    // Category/item rows replaced; FKs point at real ids.
    expect(tables.categories.rows).toHaveLength(1);
    expect(tables.categories.rows[0]).toMatchObject({ id: "real_c1", budget_id: "real_b" });
    expect(tables.budget_items.rows[0]).toMatchObject({ id: "real_i1", category_id: "real_c1" });
    // Carry marker untouched on success.
    expect(tables.sync_meta.rows.find((r) => r.table === "__carry__2026-7")).toBeTruthy();
  });

  it("conflict: cleans up optimistic rows, hydrates the winner, clears the marker", async () => {
    seedCarryOptimisticRows();
    seed([
      {
        table: "budgets",
        operation: "CARRY_SETUP",
        recordId: "temp_b",
        payload: carryPayload(),
        createdAt: 0,
      },
    ]);
    const engine = new TestEngine({
      latency: 5,
      results: {
        temp_b: {
          conflict: true,
          budgetIdMap: {
            tempId: "temp_b",
            realId: "real_b",
            record: { id: "real_b", month: 7, year: 2026, total_budget: 60000, template_id: "50-30-20" },
          },
          categoryIdMap: [],
          itemIdMap: [],
        },
      },
    });

    await engine.processQueue();

    expect(tables.sync_queue.rows[0].status).toBe("done");
    // Our optimistic rows gone; winner's budget row hydrated in.
    expect(tables.categories.rows).toHaveLength(0);
    expect(tables.budget_items.rows).toHaveLength(0);
    expect(tables.budgets.rows.map((r) => r.id)).toEqual(["real_b"]);
    expect(tables.budgets.rows[0].total_budget).toBe(60000);
    // Marker cleared so the banner doesn't advertise a carry that didn't happen.
    expect(tables.sync_meta.rows.find((r) => r.table === "__carry__2026-7")).toBeUndefined();
  });

  it("rollback on permanent failure deletes nested temp rows, the temp budget and the marker", async () => {
    seedCarryOptimisticRows();
    seed([
      {
        table: "budgets",
        operation: "CARRY_SETUP",
        recordId: "temp_b",
        payload: carryPayload(),
        createdAt: 0,
      },
    ]);
    const engine = new TestEngine({ latency: 5, failRecordIds: new Set(["temp_b"]) });

    await engine.processQueue();
    await waitFor(
      () => tables.sync_queue.rows.find((r) => r.recordId === "temp_b")?.status === "failed"
    );

    expect(tables.categories.rows).toHaveLength(0);
    expect(tables.budget_items.rows).toHaveLength(0);
    expect(tables.budgets.rows).toHaveLength(0);
    expect(tables.sync_meta.rows.find((r) => r.table === "__carry__2026-7")).toBeUndefined();
  });

  it("runs immediately despite self-declared temp ids, but waits on external ones", async () => {
    // Payload contains temp ids it declares itself (budget/cat/item) plus an
    // EXTERNAL linkId owned by a pending assets INSERT.
    tables.assets.rows.push({ id: "temp_asset" });
    seedCarryOptimisticRows();
    const payload = carryPayload();
    (payload.categories as Array<{ items: Array<Record<string, unknown>> }>)[0].items[0].linkId =
      "temp_asset";
    seed([
      {
        table: "budgets",
        operation: "CARRY_SETUP",
        recordId: "temp_b",
        payload,
        createdAt: 0,
      },
      {
        table: "assets",
        operation: "INSERT",
        recordId: "temp_asset",
        tempId: "temp_asset",
        payload: {},
        createdAt: 1,
      },
    ]);
    const engine = new TestEngine({
      latency: 10,
      realIds: { temp_asset: "real_asset" },
      results: {
        temp_b: {
          conflict: false,
          budgetIdMap: { tempId: "temp_b", realId: "real_b", record: { id: "real_b" } },
          categoryIdMap: [],
          itemIdMap: [],
        },
      },
    });

    await engine.processQueue();

    // The asset INSERT (producer) must run before the carry that references it.
    expect(engine.order[0]).toBe("INSERT:temp_asset#2");
    expect(engine.order[1]).toBe("CARRY_SETUP:temp_b#1");
    // Carried linkId resolved to the real asset id before dispatch.
    const resolved = engine.resolvedPayloads["temp_b"] as {
      categories: Array<{ items: Array<{ linkId: string }> }>;
    };
    expect(resolved.categories[0].items[0].linkId).toBe("real_asset");
    // Self-declared temp ids stayed unresolved (server maps them itself).
    expect(
      (engine.resolvedPayloads["temp_b"] as { budgetTempId: string }).budgetTempId
    ).toBe("temp_b");
  });
});


// ── Bulk batching (one round trip for many queue items) ────────────────────

function seedSmsInserts(count: number) {
  for (let i = 0; i < count; i++) {
    tables.sms_transactions.rows.push({ id: `temp_s${i}`, amount: 100 + i });
  }
  seed(
    Array.from({ length: count }, (_, i) => ({
      table: "sms_transactions" as const,
      operation: "INSERT" as const,
      recordId: `temp_s${i}`,
      tempId: `temp_s${i}`,
      payload: { dedupeKey: `k${i}`, amount: 100 + i },
      createdAt: i,
    })),
  );
}

describe("SyncEngine bulk batching", () => {
  beforeEach(() => {
    resetDB();
    vi.stubGlobal("navigator", { onLine: true });
  });

  it("collapses many SMS INSERTs into ONE round trip", async () => {
    seedSmsInserts(6);
    const engine = new TestEngine({
      latency: 5,
      realIds: Object.fromEntries(
        Array.from({ length: 6 }, (_, i) => [`temp_s${i}`, `real_s${i}`]),
      ),
    });

    await engine.processQueue();

    // One bulk call carrying all six — not six single dispatches.
    expect(engine.batchCalls).toHaveLength(1);
    expect(engine.batchCalls[0]).toEqual(
      Array.from({ length: 6 }, (_, i) => `temp_s${i}`),
    );
    expect(engine.batchCalls[0]).toHaveLength(6);
    expect(engine.order).toHaveLength(0); // executeItem never used
    // Every item drained and mapped temp → real.
    expect(
      tables.sync_queue.rows.every((r) => r.status === "done"),
    ).toBe(true);
    const mapped = Object.fromEntries(
      tables.id_map.rows.map((r) => [r.tempId, r.realId]),
    );
    expect(mapped.temp_s0).toBe("real_s0");
    expect(mapped.temp_s5).toBe("real_s5");
    expect(tables.sms_transactions.rows.map((r) => r.id).sort()).toEqual(
      Array.from({ length: 6 }, (_, i) => `real_s${i}`).sort(),
    );
  });

  it("splits a backlog larger than the batch cap across calls", async () => {
    seedSmsInserts(30);
    const engine = new TestEngine({ latency: 1 });

    await engine.processQueue();

    // Split across calls, each within the per-request cap (MAX_BATCH = 25),
    // and every item still sent exactly once.
    expect(engine.batchCalls.length).toBeGreaterThan(1);
    expect(Math.max(...engine.batchCalls.map((c) => c.length))).toBeLessThanOrEqual(25);
    expect(engine.batchCalls.flat()).toHaveLength(30);
    expect(new Set(engine.batchCalls.flat()).size).toBe(30);
  });

  it("retries only the failing item when one entry of a batch fails", async () => {
    seedSmsInserts(3);
    const engine = new TestEngine({
      latency: 1,
      failRecordIds: new Set(["temp_s1"]),
    });

    await engine.processQueue();

    const byRecord = Object.fromEntries(
      tables.sync_queue.rows.map((r) => [r.recordId, r]),
    );
    expect(byRecord.temp_s0.status).toBe("done");
    expect(byRecord.temp_s2.status).toBe("done");
    // The bad one went back to pending with a backoff, not failed-forever.
    expect(byRecord.temp_s1.status).toBe("pending");
    expect(byRecord.temp_s1.retries).toBe(1);
    engine.stop(); // disarm the backoff wake (shared in-memory DB)
  });

  it("retries every item when the whole bulk round trip throws", async () => {
    seedSmsInserts(3);
    const engine = new TestEngine({ latency: 1, failBatch: true });

    await engine.processQueue();

    expect(
      tables.sync_queue.rows.every(
        (r) => r.status === "pending" && r.retries === 1,
      ),
    ).toBe(true);
    engine.stop(); // disarm the backoff wake (shared in-memory DB)
  });

  it("emits onSynced once per batch, not once per item", async () => {
    seedSmsInserts(5);
    const synced: string[] = [];
    const engine = new TestEngine({ latency: 1 });
    engine.setCallbacks({
      onSynced: (item: SyncQueueItem) => synced.push(item.table),
    });

    await engine.processQueue();

    expect(synced).toEqual(["sms_transactions"]);
  });

  it("never batches a single item (falls back to the normal path)", async () => {
    seedSmsInserts(1);
    const engine = new TestEngine({ latency: 1 });

    await engine.processQueue();

    expect(engine.batchCalls).toHaveLength(0);
    expect(engine.order).toEqual(["INSERT:temp_s0#1"]);
  });

  it("fires onDrainEnd once, after the queue is empty", async () => {
    seedSmsInserts(4);
    let drainEnds = 0;
    let pendingAtEnd = -1;
    const engine = new TestEngine({ latency: 1 });
    engine.setCallbacks({
      onDrainEnd: () => {
        drainEnds++;
        pendingAtEnd = tables.sync_queue.rows.filter(
          (r) => r.status === "pending" || r.status === "processing",
        ).length;
      },
    });

    await engine.processQueue();

    expect(drainEnds).toBe(1);
    expect(pendingAtEnd).toBe(0);
  });
});

// ── Superseded-write collapsing ────────────────────────────────────────────

describe("SyncEngine supersede collapsing", () => {
  beforeEach(() => {
    resetDB();
    vi.stubGlobal("navigator", { onLine: true });
  });

  it("drops older UPDATEs that write the same fields of the same record", async () => {
    seed([
      {
        table: "budgets",
        operation: "UPDATE",
        recordId: "b1",
        payload: { budgetId: "b1", totalAmount: 100 },
        createdAt: 0,
      },
      {
        table: "budgets",
        operation: "UPDATE",
        recordId: "b1",
        payload: { budgetId: "b1", totalAmount: 200 },
        createdAt: 1,
      },
      {
        table: "budgets",
        operation: "UPDATE",
        recordId: "b1",
        payload: { budgetId: "b1", totalAmount: 300 },
        createdAt: 2,
      },
    ]);
    const engine = new TestEngine({ latency: 1 });

    await engine.processQueue();

    // Only the newest write reached the server.
    expect(engine.order).toEqual(["UPDATE:b1#3"]);
    expect(
      (engine.resolvedPayloads["b1"] as { totalAmount: number }).totalAmount,
    ).toBe(300);
    // The superseded rows are gone from the queue entirely.
    expect(tables.sync_queue.rows).toHaveLength(1);
  });

  it("keeps updates that write DIFFERENT fields", async () => {
    seed([
      {
        table: "categories",
        operation: "UPDATE",
        recordId: "c1",
        payload: { categoryId: "c1", updates: { name: "Food" } },
        createdAt: 0,
      },
      {
        table: "categories",
        operation: "UPDATE",
        recordId: "c1",
        payload: { categoryId: "c1", updates: { allocated_amount: 5000 } },
        createdAt: 1,
      },
    ]);
    const engine = new TestEngine({ latency: 1 });

    await engine.processQueue();

    expect(engine.order).toEqual(["UPDATE:c1#1", "UPDATE:c1#2"]);
  });

  it("never collapses across a different operation on the same record", async () => {
    seed([
      {
        table: "budget_items",
        operation: "UPDATE",
        recordId: "i1",
        payload: { itemId: "i1", updates: { planned_amount: 10 } },
        createdAt: 0,
      },
      {
        table: "budget_items",
        operation: "PAYMENT",
        recordId: "i1",
        payload: { itemId: "i1", amount: 5 },
        createdAt: 1,
      },
      {
        table: "budget_items",
        operation: "UPDATE",
        recordId: "i1",
        payload: { itemId: "i1", updates: { planned_amount: 20 } },
        createdAt: 2,
      },
    ]);
    const engine = new TestEngine({ latency: 1 });

    await engine.processQueue();

    expect(engine.order).toEqual([
      "UPDATE:i1#1",
      "PAYMENT:i1#2",
      "UPDATE:i1#3",
    ]);
  });

  it("never collapses a spend-bearing update (actual_amount cascades)", async () => {
    seed([
      {
        table: "budget_items",
        operation: "UPDATE",
        recordId: "i2",
        payload: { itemId: "i2", updates: { actual_amount: 100 } },
        createdAt: 0,
      },
      {
        table: "budget_items",
        operation: "UPDATE",
        recordId: "i2",
        payload: { itemId: "i2", updates: { actual_amount: 200 } },
        createdAt: 1,
      },
    ]);
    const engine = new TestEngine({ latency: 1 });

    await engine.processQueue();

    expect(engine.order).toEqual(["UPDATE:i2#1", "UPDATE:i2#2"]);
  });

  it("never collapses updates on different records", async () => {
    seed([
      {
        table: "assets",
        operation: "UPDATE",
        recordId: "a1",
        payload: { id: "a1", updates: { value: 1 } },
        createdAt: 0,
      },
      {
        table: "assets",
        operation: "UPDATE",
        recordId: "a2",
        payload: { id: "a2", updates: { value: 2 } },
        createdAt: 1,
      },
    ]);
    const engine = new TestEngine({ latency: 1 });

    await engine.processQueue();

    expect(engine.order.sort()).toEqual(["UPDATE:a1#1", "UPDATE:a2#2"]);
  });
});
