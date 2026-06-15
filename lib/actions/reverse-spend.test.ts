import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the reverse-spend primitives (the riskiest part of SMS autolog
 * delete/unallocate). The repo has no fake-indexeddb / supabase test infra, so
 * we inject an in-memory state-backed stub that models the exact chained query
 * surface these actions touch. The arithmetic + cascade branching exercised here
 * is the REAL module code; only Supabase + the asset/debt cascades are stubbed.
 */

// ── In-memory state-backed Supabase stub ───────────────────────────────────
type Row = Record<string, unknown>;
const state: Record<string, Map<string, Row>> = {
  budget_items: new Map(),
  debts: new Map(),
  assets: new Map(),
};

const USER = { id: "u1" };

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
    if (this.op === "delete" && row) state[this.table].delete(row.id as string);
    return row;
  }
  async maybeSingle() {
    return { data: this.apply() ?? null, error: null };
  }
  async single() {
    const data = this.apply();
    return { data: data ?? null, error: data ? null : { message: "not found" } };
  }
  // Awaitable for the revert path: `await supabase.from().update().eq().eq()`.
  then(resolve: (v: { data: Row | null; error: null }) => void) {
    resolve({ data: this.apply() ?? null, error: null });
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
const addAssetEntry = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/actions/asset-history", () => ({
  addAssetEntry: (...args: unknown[]) => addAssetEntry(...args),
  upsertTodaySnapshot: vi.fn(async () => {}),
}));
// NOTE: debt module is NOT mocked — reverseSpend's debt cascade exercises the
// real reverseDebtPayment, and the reverseDebtPayment suite below tests it too.
vi.mock("@/lib/utils/budget-completion", () => ({
  computeAutoCompletion: (planned: number, actual: number) => actual >= planned,
  actualOnManualComplete: (planned: number) => planned,
}));
vi.mock("@/lib/server/push-notify", () => ({ notifyUser: vi.fn(async () => {}) }));

import { reverseSpend } from "@/lib/actions/budget";
import { reverseDebtPayment } from "@/lib/actions/debt";

function seedItem(over: Partial<Row> = {}): Row {
  const row: Row = {
    id: "item1",
    user_id: "u1",
    name: "Coffee",
    actual_amount: 100,
    planned_amount: 80,
    is_completed: true,
    link_type: null,
    link_id: null,
    ...over,
  };
  state.budget_items.set(row.id as string, row);
  return row;
}

beforeEach(() => {
  state.budget_items.clear();
  state.debts.clear();
  state.assets.clear();
  addAssetEntry.mockClear();
});

describe("reverseSpend", () => {
  it("decrements actual_amount", async () => {
    seedItem({ actual_amount: 100 });
    const res = await reverseSpend("item1", 30);
    expect(res.reversed).toBe(true);
    expect(state.budget_items.get("item1")!.actual_amount).toBe(70);
  });

  it("clamps at 0 (no negative actual)", async () => {
    seedItem({ actual_amount: 20 });
    await reverseSpend("item1", 50);
    expect(state.budget_items.get("item1")!.actual_amount).toBe(0);
  });

  it("reopens a completed item when it drops below planned", async () => {
    seedItem({ actual_amount: 100, planned_amount: 80, is_completed: true });
    await reverseSpend("item1", 50); // 50 < 80 planned
    expect(state.budget_items.get("item1")!.is_completed).toBe(false);
  });

  it("keeps completion when still at/above planned", async () => {
    seedItem({ actual_amount: 200, planned_amount: 80, is_completed: true });
    await reverseSpend("item1", 50); // 150 >= 80
    expect(state.budget_items.get("item1")!.is_completed).toBe(true);
  });

  it("no-ops when the item was deleted", async () => {
    const res = await reverseSpend("ghost", 30);
    expect(res.reversed).toBe(false);
  });

  it("reverses an asset cascade with a withdraw", async () => {
    seedItem({ link_type: "asset", link_id: "a1" });
    state.assets.set("a1", { id: "a1", user_id: "u1", name: "Savings" });
    await reverseSpend("item1", 40);
    expect(addAssetEntry).toHaveBeenCalledWith(
      "a1",
      "withdraw",
      40,
      expect.any(String),
      undefined,
      { suppressLog: true },
    );
  });

  it("reverses a debt cascade (real reverseDebtPayment)", async () => {
    seedItem({ link_type: "debt", link_id: "d1" });
    state.debts.set("d1", {
      id: "d1", user_id: "u1", name: "Loan",
      total_paid: 100, total_repayable: 500, principal: 500, is_closed: false,
    });
    await reverseSpend("item1", 60);
    expect(state.debts.get("d1")!.total_paid).toBe(40);
  });

  it("reverts the item update when the cascade fails", async () => {
    seedItem({ actual_amount: 100, link_type: "asset", link_id: "a1" });
    state.assets.set("a1", { id: "a1", user_id: "u1", name: "Savings" });
    addAssetEntry.mockRejectedValueOnce(new Error("cascade boom"));
    await expect(reverseSpend("item1", 40)).rejects.toThrow("cascade boom");
    expect(state.budget_items.get("item1")!.actual_amount).toBe(100);
  });
});

describe("reverseDebtPayment", () => {
  function seedDebt(over: Partial<Row> = {}): Row {
    const row: Row = {
      id: "d1",
      user_id: "u1",
      name: "Loan",
      total_paid: 100,
      total_repayable: 500,
      principal: 500,
      is_closed: false,
      ...over,
    };
    state.debts.set("d1", row);
    return row;
  }

  it("decrements total_paid", async () => {
    seedDebt({ total_paid: 100 });
    await reverseDebtPayment("d1", 30);
    expect(state.debts.get("d1")!.total_paid).toBe(70);
  });

  it("clamps total_paid at 0", async () => {
    seedDebt({ total_paid: 20 });
    await reverseDebtPayment("d1", 50);
    expect(state.debts.get("d1")!.total_paid).toBe(0);
  });

  it("reopens a closed debt when dropping below repayable", async () => {
    seedDebt({ total_paid: 500, total_repayable: 500, is_closed: true });
    await reverseDebtPayment("d1", 100); // 400 < 500
    expect(state.debts.get("d1")!.is_closed).toBe(false);
  });
});
