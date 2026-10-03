import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * applyQuickSpend against a just-created budget item.
 *
 * The manual spend sheet logs to the temp id `useAddBudgetItem` returned. If the
 * item's INSERT syncs first, `replaceIDBRecord` deletes the temp row and the
 * swap lives only in `id_map`. The old hook then missed IDB and fell back to
 * calling `quickLogSpend` directly AND queueing a PAYMENT: with a temp id the
 * direct call threw "Item not found"; with a real id the spend hit the server
 * twice.
 *
 * In-memory Dexie-shaped stub (no fake-indexeddb here), modelling only the
 * surface the helper touches.
 */

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
  writeManualTransaction: vi.fn(async () => ({ txnId: "temp_txn" })),
}));
// The direct server path must never run — it double-applied the spend.
vi.mock("@/lib/actions/budget", () => ({
  quickLogSpend: vi.fn(async () => {
    throw new Error("server action must not be called");
  }),
}));

import { applyQuickSpend } from "./quickSpend";
import { writeManualTransaction } from "@/lib/hooks/useSmsTransactions";

function item(id: string, actual = 0): Row {
  return { id, name: "Taxi", planned_amount: 100, actual_amount: actual };
}

beforeEach(() => {
  vi.mocked(writeManualTransaction).mockClear();
});

describe("applyQuickSpend", () => {
  it("logs to an existing item: optimistic bump + one PAYMENT", async () => {
    dbStub = {
      profiles: makeTable([{ id: "p", currency: "USD" }]),
      id_map: makeTable([], "tempId"),
      budget_items: makeTable([item("real_1", 10)]),
    };
    const enqueue = vi.fn(async () => {});

    const res = await applyQuickSpend({ itemId: "real_1", amount: 25 }, { enqueue });

    expect(res).toMatchObject({ actual: 35, remaining: 65, planned: 100 });
    expect(dbStub.budget_items.rows[0].actual_amount).toBe(35);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "PAYMENT", payload: { itemId: "real_1", amount: 25 } }),
    );
    expect(writeManualTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ budgetItemId: "real_1", currency: "USD" }),
      expect.anything(),
    );
  });

  it("follows id_map when the temp row was already swapped for the real one", async () => {
    dbStub = {
      profiles: makeTable([]),
      id_map: makeTable([{ id: "temp_a", tempId: "temp_a", realId: "real_a" }], "tempId"),
      budget_items: makeTable([item("real_a")]),
    };
    const enqueue = vi.fn(async () => {});

    const res = await applyQuickSpend({ itemId: "temp_a", amount: 40 }, { enqueue });

    expect(res).toMatchObject({ actual: 40 });
    expect(dbStub.budget_items.rows[0].actual_amount).toBe(40);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "PAYMENT", payload: { itemId: "real_a", amount: 40 } }),
    );
  });

  it("re-reads when the swap lands between the read and the write", async () => {
    const items = makeTable([item("temp_b")]);
    const idMap = makeTable([], "tempId");
    // First update targets the temp row, which the INSERT reconcile has just
    // moved: emulate replaceIDBRecord running right before the write.
    const realUpdate = items.update.bind(items);
    let swapped = false;
    items.update = async (id, changes) => {
      if (!swapped) {
        swapped = true;
        items.rows.splice(0, 1, item("real_b"));
        idMap.rows.push({ id: "temp_b", tempId: "temp_b", realId: "real_b" });
      }
      return realUpdate(id, changes);
    };
    dbStub = { profiles: makeTable([]), id_map: idMap, budget_items: items };
    const enqueue = vi.fn(async () => {});

    const res = await applyQuickSpend({ itemId: "temp_b", amount: 15 }, { enqueue });

    expect(res).toMatchObject({ actual: 15 });
    expect(items.rows[0]).toMatchObject({ id: "real_b", actual_amount: 15 });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { itemId: "real_b", amount: 15 } }),
    );
  });

  it("only queues (never also sends) when the item is not in IDB", async () => {
    dbStub = {
      profiles: makeTable([]),
      id_map: makeTable([], "tempId"),
      budget_items: makeTable([]),
    };
    const enqueue = vi.fn(async () => {});

    const res = await applyQuickSpend({ itemId: "real_x", amount: 5 }, { enqueue });

    expect(res).toBeNull();
    const payments = (enqueue.mock.calls as unknown[][]).filter(
      ([q]) => (q as { operation: string }).operation === "PAYMENT",
    );
    expect(payments).toHaveLength(1);
  });
});
