import { describe, it, expect, vi, beforeEach } from "vitest";

interface Row {
  id: string;
  [k: string]: unknown;
}

function makeTable(seed: Row[] = [], key = "id") {
  const rows = [...seed];
  return {
    rows,
    async get(id: string) {
      return rows.find((r) => r[key] === id);
    },
    async add(row: Row) {
      rows.push(row);
    },
    async update(id: string, changes: Record<string, unknown>) {
      const row = rows.find((r) => r[key] === id);
      if (!row) return 0;
      Object.assign(row, changes);
      return 1;
    },
    async toArray() {
      return rows;
    },
  };
}

let dbStub: Record<string, ReturnType<typeof makeTable>>;

vi.mock("@/lib/db", () => ({ getDB: () => dbStub }));
vi.mock("@/lib/utils/budget-cascade", () => ({
  applyLinkedSpendCascadeIDB: vi.fn(async () => {}),
}));
vi.mock("@/lib/hooks/useSmsTransactions", () => ({
  invalidateSmsCaches: vi.fn(),
  notifyNearLimitForItem: vi.fn(async () => {}),
}));
vi.mock("@/lib/hooks/useSync", () => ({ useEnqueue: () => vi.fn() }));
vi.mock("@/lib/hooks/useAllocatePicker", () => ({ ALLOCATE_PICKER_KEY: ["sms-picker"] }));

import { applySplit } from "./useSplitTransaction";

function item(id: string): Row {
  return { id, name: id, planned_amount: 1000, actual_amount: 100, overspend_count: 0 };
}
function seq() {
  let n = 0;
  return () => `u${++n}`;
}
function setup(status = "pending") {
  dbStub = {
    profiles: makeTable([{ id: "p", currency: "USD" }]),
    id_map: makeTable([], "tempId"),
    budget_items: makeTable([item("a"), item("b"), item("c")]),
    sms_transactions: makeTable([
      {
        id: "t1",
        amount: 2400,
        currency: "INR",
        merchant_raw: "Shop",
        merchant_normalized: "shop",
        occurred_at: "2026-10-01T00:00:00Z",
        dedupe_key: "k",
        status,
        matched_rule_id: "r1",
        budget_item_id: null,
      },
    ]),
  };
}

beforeEach(() => setup());

describe("applySplit", () => {
  it("sms split writes optimistic rows and one SPLIT", async () => {
    const enqueue = vi.fn(async () => {});
    const { splitId } = await applySplit(
      {
        sourceTxnId: "t1",
        total: 2400,
        label: "Groceries",
        parts: [
          { budgetItemId: "a", amount: 1500 },
          { budgetItemId: "b", amount: 600 },
          { budgetItemId: "c", amount: null },
        ],
      },
      { enqueue, uuid: seq() },
    );
    const rows = dbStub.sms_transactions.rows;
    expect(rows[0]).toMatchObject({
      status: "categorized",
      amount: 1500,
      budget_item_id: "a",
      label: "Groceries",
      matched_rule_id: null,
    });
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({
      amount: 600,
      dedupe_key: `k#split:${splitId}:2`,
      source: "sms",
      raw_text: null,
    });
    expect(rows[2]).toMatchObject({ amount: 300, dedupe_key: `k#split:${splitId}:3` });
    expect(rows[1].id).toMatch(/^temp_/);
    const actual = (id: string) =>
      dbStub.budget_items.rows.find((r) => r.id === id)!.actual_amount;
    expect([actual("a"), actual("b"), actual("c")]).toEqual([1600, 700, 400]);
    expect(enqueue).toHaveBeenCalledTimes(1);
    const call = (enqueue.mock.calls[0] as unknown[])[0] as {
      operation: string;
      recordId: string;
      payload: { parts: Array<{ tempId: string | null }> };
    };
    expect(call.operation).toBe("SPLIT");
    expect(call.recordId).toBe("t1");
    expect(call.payload.parts[0].tempId).toBeNull();
    expect(call.payload.parts[1].tempId).toBe(rows[1].id);
  });

  it("manual split", async () => {
    const enqueue = vi.fn(async () => {});
    await applySplit(
      {
        sourceTxnId: null,
        total: 100,
        label: null,
        parts: [
          { budgetItemId: "a", amount: 40 },
          { budgetItemId: "b", amount: null },
        ],
      },
      { enqueue, uuid: seq() },
    );
    const rows = dbStub.sms_transactions.rows.slice(1);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.source === "manual" && r.currency === "USD")).toBe(true);
    const call = (enqueue.mock.calls[0] as unknown[])[0] as {
      recordId: string;
      payload: { parts: Array<{ tempId: string | null }> };
    };
    expect(call.recordId).toMatch(/^split_/);
    expect(call.payload.parts.every((p) => p.tempId)).toBe(true);
  });

  it("rejects invalid split", async () => {
    const enqueue = vi.fn(async () => {});
    await expect(
      applySplit(
        {
          sourceTxnId: "t1",
          total: 100,
          label: null,
          parts: [
            { budgetItemId: "a", amount: 40 },
            { budgetItemId: "a", amount: null },
          ],
        },
        { enqueue },
      ),
    ).rejects.toThrow("Invalid split");
    expect(dbStub.sms_transactions.rows).toHaveLength(1);
    expect(dbStub.sms_transactions.rows[0].status).toBe("pending");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("rejects non-pending source", async () => {
    setup("categorized");
    const enqueue = vi.fn(async () => {});
    await expect(
      applySplit(
        {
          sourceTxnId: "t1",
          total: 100,
          label: null,
          parts: [
            { budgetItemId: "a", amount: 40 },
            { budgetItemId: "b", amount: null },
          ],
        },
        { enqueue },
      ),
    ).rejects.toThrow();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
