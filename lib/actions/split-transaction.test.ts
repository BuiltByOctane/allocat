import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;
const state: Record<string, Map<string, Row>> = {
  sms_transactions: new Map(),
  budget_items: new Map(),
};
const touched = new Set<string>();
let seq = 0;
const USER = { id: "u1" };

class Builder {
  private op: "select" | "update" | "insert" = "select";
  private payload: Row | null = null;
  private filters: Array<[string, unknown]> = [];
  private inFilter: [string, unknown[]] | null = null;
  constructor(private table: string) {
    touched.add(table);
  }
  select() {
    return this;
  }
  update(p: Row) {
    this.op = "update";
    this.payload = p;
    return this;
  }
  insert(p: Row) {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  eq(f: string, v: unknown) {
    this.filters.push([f, v]);
    return this;
  }
  in(f: string, v: unknown[]) {
    this.inFilter = [f, v];
    return this;
  }
  private rows(): Row[] {
    return [...(state[this.table]?.values() ?? [])].filter(
      (r) =>
        this.filters.every(([f, v]) => r[f] === v) &&
        (!this.inFilter || this.inFilter[1].includes(r[this.inFilter[0]])),
    );
  }
  private apply(): Row[] {
    if (this.op === "insert") {
      const row = { id: `real${++seq}`, user_id: "u1", ...this.payload! };
      state[this.table].set(row.id as string, row);
      return [row];
    }
    const rows = this.rows();
    if (this.op === "update") rows.forEach((r) => Object.assign(r, this.payload));
    return rows;
  }
  async maybeSingle() {
    return { data: this.apply()[0] ?? null, error: null };
  }
  async single() {
    const d = this.apply()[0];
    return { data: d ?? null, error: d ? null : { message: "nf" } };
  }
  then(resolve: (v: { data: Row[]; error: null }) => void) {
    resolve({ data: this.apply(), error: null });
  }
}

const supabaseStub = { from: (t: string) => new Builder(t) };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseStub,
  getAuthedUser: async () => USER,
}));
const logActivity = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/server/activity-logger", () => ({
  logActivity: (...a: unknown[]) => logActivity(...a),
  getUserCurrency: vi.fn(async () => "INR"),
  fmt: (n: number) => `Rs${n}`,
}));
const quickLogSpend = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/actions/budget", () => ({
  quickLogSpend: (...a: unknown[]) => quickLogSpend(...a),
  reverseSpend: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/sms-period", () => ({ loadPeriodContext: vi.fn() }));
vi.mock("@/lib/server/push-notify", () => ({ notifyUser: vi.fn(async () => {}) }));

import { splitTransaction } from "@/lib/actions/sms";
import type { SplitTxnPayload } from "@/lib/sms/split";

const smsPayload = (): SplitTxnPayload => ({
  splitId: "s1",
  sourceTxnId: "t1",
  total: 2400,
  currency: "INR",
  label: null,
  merchantRaw: "BigBazaar",
  merchantNormalized: "bigbazaar",
  occurredAt: "2026-10-01T00:00:00Z",
  parts: [
    { budgetItemId: "a", amount: 1500, dedupeKey: "k", tempId: null },
    { budgetItemId: "b", amount: 600, dedupeKey: "k#split:s1:2", tempId: "temp_2" },
    { budgetItemId: "c", amount: 300, dedupeKey: "k#split:s1:3", tempId: "temp_3" },
  ],
});

beforeEach(() => {
  state.sms_transactions.clear();
  state.budget_items.clear();
  touched.clear();
  quickLogSpend.mockClear();
  logActivity.mockClear();
  seq = 0;
  for (const id of ["a", "b", "c"])
    state.budget_items.set(id, {
      id,
      user_id: "u1",
      name: `Item${id}`,
      planned_amount: 0,
      actual_amount: 0,
    });
  state.sms_transactions.set("t1", {
    id: "t1",
    user_id: "u1",
    status: "pending",
    amount: 2400,
    dedupe_key: "k",
  });
});

describe("splitTransaction", () => {
  it("sms split applies each part once", async () => {
    const res = await splitTransaction(smsPayload());
    expect(quickLogSpend.mock.calls.map((c) => c[1]).sort()).toEqual([1500, 300, 600].sort());
    const src = state.sms_transactions.get("t1")!;
    expect(src.status).toBe("categorized");
    expect(src.amount).toBe(1500);
    expect(src.budget_item_id).toBe("a");
    const rows = [...state.sms_transactions.values()].filter((r) => r.id !== "t1");
    expect(rows.map((r) => r.dedupe_key)).toEqual(["k#split:s1:2", "k#split:s1:3"]);
    expect(rows.every((r) => r.source === "sms" && r.original_amount === null)).toBe(true);
    expect(res.partIdMap).toHaveLength(2);
  });

  it("retry skips parts already categorized", async () => {
    await splitTransaction(smsPayload());
    const res = await splitTransaction(smsPayload());
    expect(quickLogSpend).toHaveBeenCalledTimes(3);
    expect(state.sms_transactions.size).toBe(3);
    expect(res.partIdMap).toHaveLength(2);
  });

  it("rejects non-pending source", async () => {
    state.sms_transactions.get("t1")!.status = "categorized";
    await expect(splitTransaction(smsPayload())).rejects.toThrow(
      "Transaction is no longer pending",
    );
    expect(quickLogSpend).not.toHaveBeenCalled();
  });

  it("manual split", async () => {
    const res = await splitTransaction({
      splitId: "s1",
      sourceTxnId: null,
      total: 500,
      currency: "INR",
      label: "Lunch",
      merchantRaw: null,
      merchantNormalized: null,
      occurredAt: "2026-10-02T00:00:00Z",
      parts: [
        { budgetItemId: "a", amount: 200, dedupeKey: "manual_split:s1:1", tempId: "t_1" },
        { budgetItemId: "b", amount: 300, dedupeKey: "manual_split:s1:2", tempId: "t_2" },
      ],
    });
    const rows = [...state.sms_transactions.values()].filter((r) => r.id !== "t1");
    expect(rows.map((r) => r.dedupe_key)).toEqual(["manual_split:s1:1", "manual_split:s1:2"]);
    expect(rows.every((r) => r.source === "manual")).toBe(true);
    expect(quickLogSpend.mock.calls.every((c) => c.length === 2)).toBe(true);
    expect(res.partIdMap).toHaveLength(2);
    expect(logActivity.mock.calls[0][2]).toMatchObject({ action_type: "manual_spend_split" });
  });

  it("one activity entry", async () => {
    await splitTransaction(smsPayload());
    expect(logActivity).toHaveBeenCalledTimes(1);
    expect(logActivity.mock.calls[0][2]).toMatchObject({
      action_type: "sms_txn_split",
      category: "budget",
    });
  });

  it("recovers when the request dies mid-split", async () => {
    quickLogSpend.mockImplementationOnce(async () => {});
    quickLogSpend.mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    await expect(splitTransaction(smsPayload())).rejects.toThrow("boom");
    await splitTransaction(smsPayload());
    // 1 ok + 1 failed + retry applies the failed part + the remaining part + source
    expect(quickLogSpend).toHaveBeenCalledTimes(4);
    expect(state.sms_transactions.size).toBe(3);
    expect(state.sms_transactions.get("t1")!.status).toBe("categorized");
  });

  it("rejects duplicate items", async () => {
    const p = smsPayload();
    p.parts[1].budgetItemId = "a";
    await expect(splitTransaction(p)).rejects.toThrow("Invalid split");
    expect(quickLogSpend).not.toHaveBeenCalled();
  });

  it("rejects a sum that differs from total", async () => {
    const p = smsPayload();
    p.total = 2500;
    await expect(splitTransaction(p)).rejects.toThrow("Invalid split");
    expect(quickLogSpend).not.toHaveBeenCalled();
  });

  it("retry after full success logs activity once", async () => {
    await splitTransaction(smsPayload());
    await splitTransaction(smsPayload());
    expect(logActivity).toHaveBeenCalledTimes(1);
  });

  it("missing source row throws", async () => {
    state.sms_transactions.clear();
    await expect(splitTransaction(smsPayload())).rejects.toThrow(
      "Transaction is no longer pending",
    );
  });

  it("never touches merchant_rules", async () => {
    await splitTransaction(smsPayload());
    expect(touched.has("merchant_rules")).toBe(false);
  });
});
