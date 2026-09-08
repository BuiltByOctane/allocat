import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression tests for the compare-and-swap retry in `quickLogSpend` and
 * `makePayment` (see lib/actions/concurrency.ts). Both functions read a money
 * counter, add to it, and write it back filtered on the value they read
 * (`.eq("actual_amount", previous)` / `.eq("total_paid", previous)`). This
 * mock simulates a concurrent writer landing between our read and our write:
 * the first CAS attempt's update is filtered against a now-stale value and
 * matches no row (a lost race), forcing a re-read. The assertion is that the
 * FINAL counter value reflects both increments (ours + the concurrent one),
 * not just the last writer clobbering the first — i.e. the retry actually
 * re-read rather than reusing a stale local.
 */

type Row = Record<string, unknown>;
const state: Record<string, Map<string, Row>> = {
  budget_items: new Map(),
  debts: new Map(),
  assets: new Map(),
};

const USER = { id: "u1" };

// Counts reads (select().single()) per table so we can inject the "concurrent
// writer" mutation exactly once, right after our first read captures its
// snapshot — mirroring a real race window between our SELECT and our UPDATE.
const readCounts: Record<string, number> = { budget_items: 0, debts: 0 };
// How much a simulated concurrent writer adds to the counter, keyed by table.
const concurrentDelta: Record<string, number> = { budget_items: 0, debts: 0 };
// Which field the concurrent writer bumps, per table.
const counterField: Record<string, string> = {
  budget_items: "actual_amount",
  debts: "total_paid",
};

class Builder {
  private table: string;
  private op: "select" | "update" | "delete" = "select";
  private payload: Row | null = null;
  private filters: Array<[string, unknown]> = [];
  constructor(table: string) {
    this.table = table;
  }
  select() {
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(field: string, value: unknown) {
    this.filters.push([field, value]);
    return this;
  }
  private match(): Row | undefined {
    const rows = [...(state[this.table]?.values() ?? [])];
    return rows.find((r) => this.filters.every(([f, v]) => r[f] === v));
  }
  private apply(): Row | undefined {
    const row = this.match();
    if (this.op === "update" && row && this.payload) Object.assign(row, this.payload);
    return row;
  }
  async single() {
    const row = this.apply();
    if (this.op === "select" && row && this.table in readCounts) {
      readCounts[this.table]++;
      // Snapshot BEFORE injecting the concurrent write, so the caller's local
      // `previous` value is what it was at read time — exactly like real
      // Supabase, which returns a value, not a live-bound reference.
      const snapshot = { ...row };
      if (readCounts[this.table] === 1 && concurrentDelta[this.table]) {
        const field = counterField[this.table];
        row[field] = Number(row[field]) + concurrentDelta[this.table];
      }
      return { data: snapshot, error: null };
    }
    return { data: row ? { ...row } : null, error: row ? null : { message: "not found" } };
  }
  async maybeSingle() {
    const row = this.apply();
    return { data: row ? { ...row } : null, error: null };
  }
}

const supabaseStub = {
  auth: { getUser: async () => ({ data: { user: USER } }) },
  from: (table: string) => new Builder(table),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseStub,
}));
vi.mock("@/lib/server/activity-logger", () => ({
  logActivity: vi.fn(async () => {}),
  getUserCurrency: vi.fn(async () => "INR"),
  fmt: (n: number) => `₹${n}`,
}));
vi.mock("@/lib/actions/asset-history", () => ({
  addAssetEntry: vi.fn(async () => {}),
  upsertTodaySnapshot: vi.fn(async () => {}),
}));
vi.mock("@/lib/utils/budget-completion", () => ({
  computeAutoCompletion: (planned: number, actual: number) => actual >= planned,
  actualOnManualComplete: (planned: number) => planned,
}));
vi.mock("@/lib/server/push-notify", () => ({ notifyUser: vi.fn(async () => {}) }));

import { quickLogSpend } from "@/lib/actions/budget";
import { makePayment } from "@/lib/actions/debt";

beforeEach(() => {
  state.budget_items.clear();
  state.debts.clear();
  state.assets.clear();
  readCounts.budget_items = 0;
  readCounts.debts = 0;
  concurrentDelta.budget_items = 0;
  concurrentDelta.debts = 0;
});

describe("quickLogSpend CAS retry", () => {
  it("re-reads on a lost race instead of clobbering a concurrent increment", async () => {
    state.budget_items.set("item1", {
      id: "item1",
      user_id: "u1",
      name: "Coffee",
      actual_amount: 100,
      planned_amount: 1000, // stays well under planned so the overspend path is skipped
      is_completed: false,
      overspend_count: 0,
      link_type: null,
      link_id: null,
    });

    // Simulate a second concurrent quickLogSpend (+30) landing between our
    // first read and our first update attempt — our first CAS attempt's
    // `.eq("actual_amount", 100)` will no longer match (row is now 130).
    concurrentDelta.budget_items = 30;

    const result = await quickLogSpend("item1", 10);

    // If the retry had reused the stale `previousActual` (100) instead of
    // re-reading, the final value would be 110 and the concurrent +30 would
    // be silently lost. A correct re-read yields 130 + 10 = 140.
    expect(result.actual).toBe(140);
    expect(state.budget_items.get("item1")!.actual_amount).toBe(140);
    // Two reads: the lost-race attempt, then the successful retry.
    expect(readCounts.budget_items).toBe(2);
  });
});

describe("makePayment CAS retry", () => {
  it("re-reads on a lost race instead of clobbering a concurrent payment", async () => {
    state.debts.set("d1", {
      id: "d1",
      user_id: "u1",
      name: "Loan",
      total_paid: 100,
      total_repayable: 1000,
      principal: 1000,
      is_closed: false,
    });

    // Simulate a second concurrent makePayment (+30) landing between our
    // first read and our first update attempt.
    concurrentDelta.debts = 30;

    const result = await makePayment("d1", 10, { suppressLog: true });

    expect(result.total_paid).toBe(140);
    expect(state.debts.get("d1")!.total_paid).toBe(140);
    expect(readCounts.debts).toBe(2);
  });
});
