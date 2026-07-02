import { describe, expect, it } from "vitest";
import {
  groupAllocationsForMonth,
  type AllocBudgetItemRow,
  type AllocCategoryRow,
  type AllocTxnRow,
} from "./monthAllocations";

const CAT_JULY: AllocCategoryRow = { id: "cat-july", name: "Food", icon: "🍔" };
const CAT_JUNE: AllocCategoryRow = { id: "cat-june", name: "Food (June)", icon: "🍔" };

const ITEM_JULY: AllocBudgetItemRow = {
  id: "item-july-groceries",
  name: "Groceries",
  category_id: CAT_JULY.id,
  emoji: "🛒",
};
const ITEM_JUNE: AllocBudgetItemRow = {
  id: "item-june-groceries",
  name: "Groceries (June)",
  category_id: CAT_JUNE.id,
  emoji: null,
};

function txn(overrides: Partial<AllocTxnRow> & { id: string }): AllocTxnRow {
  return {
    budget_item_id: null,
    occurred_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("groupAllocationsForMonth", () => {
  it("groups a txn allocated to the selected month's item with that month's meta", () => {
    const t = txn({ id: "t1", budget_item_id: ITEM_JULY.id, created_at: "2026-07-10T00:00:00.000Z" });
    const groups = groupAllocationsForMonth({
      txns: [t],
      monthItems: [ITEM_JULY],
      monthCats: [CAT_JULY],
      allItemIds: new Set([ITEM_JULY.id]),
      month: 7,
      year: 2026,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].itemId).toBe(ITEM_JULY.id);
    expect(groups[0].item).toEqual({
      itemName: "Groceries",
      categoryName: "Food",
      icon: "🛒", // item emoji preferred over category icon
    });
    expect(groups[0].txns).toEqual([t]);
  });

  it("excludes a txn allocated to a different month's item", () => {
    const t = txn({ id: "t1", budget_item_id: ITEM_JUNE.id, created_at: "2026-07-10T00:00:00.000Z" });
    const groups = groupAllocationsForMonth({
      txns: [t],
      monthItems: [ITEM_JULY],
      monthCats: [CAT_JULY],
      // Both items exist somewhere across all months.
      allItemIds: new Set([ITEM_JULY.id, ITEM_JUNE.id]),
      month: 7,
      year: 2026,
    });
    expect(groups).toHaveLength(0);
  });

  it("groups an orphan (deleted item id) with occurred_at in the selected month under __unknown__", () => {
    const t = txn({
      id: "t1",
      budget_item_id: "deleted-item",
      occurred_at: "2026-07-15T00:00:00.000Z",
      created_at: "2026-07-15T00:00:00.000Z",
    });
    const groups = groupAllocationsForMonth({
      txns: [t],
      monthItems: [ITEM_JULY],
      monthCats: [CAT_JULY],
      allItemIds: new Set([ITEM_JULY.id]), // deleted-item not present anywhere
      month: 7,
      year: 2026,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].itemId).toBe("__unknown__");
    expect(groups[0].item).toBeNull();
    expect(groups[0].txns).toEqual([t]);
  });

  it("excludes an orphan whose occurred_at falls in another month", () => {
    const t = txn({
      id: "t1",
      budget_item_id: "deleted-item",
      occurred_at: "2026-06-15T00:00:00.000Z",
      created_at: "2026-06-15T00:00:00.000Z",
    });
    const groups = groupAllocationsForMonth({
      txns: [t],
      monthItems: [ITEM_JULY],
      monthCats: [CAT_JULY],
      allItemIds: new Set([ITEM_JULY.id]),
      month: 7,
      year: 2026,
    });
    expect(groups).toHaveLength(0);
  });

  it("falls back to created_at when occurred_at is null for orphan month membership", () => {
    const t = txn({
      id: "t1",
      budget_item_id: null,
      occurred_at: null,
      created_at: "2026-07-15T00:00:00.000Z",
    });
    const groups = groupAllocationsForMonth({
      txns: [t],
      monthItems: [ITEM_JULY],
      monthCats: [CAT_JULY],
      allItemIds: new Set([ITEM_JULY.id]),
      month: 7,
      year: 2026,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].itemId).toBe("__unknown__");
  });

  it("orders txns newest-first within a group regardless of input order", () => {
    const older = txn({ id: "older", budget_item_id: ITEM_JULY.id, created_at: "2026-07-01T00:00:00.000Z" });
    const newer = txn({ id: "newer", budget_item_id: ITEM_JULY.id, created_at: "2026-07-20T00:00:00.000Z" });
    const groups = groupAllocationsForMonth({
      txns: [older, newer],
      monthItems: [ITEM_JULY],
      monthCats: [CAT_JULY],
      allItemIds: new Set([ITEM_JULY.id]),
      month: 7,
      year: 2026,
    });
    expect(groups[0].txns.map((t) => t.id)).toEqual(["newer", "older"]);
  });

  it("treats txns with a null budget_item_id as orphans", () => {
    const t = txn({
      id: "t1",
      budget_item_id: null,
      occurred_at: "2026-07-05T00:00:00.000Z",
      created_at: "2026-07-05T00:00:00.000Z",
    });
    const groups = groupAllocationsForMonth({
      txns: [t],
      monthItems: [ITEM_JULY],
      monthCats: [CAT_JULY],
      allItemIds: new Set([ITEM_JULY.id]),
      month: 7,
      year: 2026,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].itemId).toBe("__unknown__");
    expect(groups[0].item).toBeNull();
  });
});
