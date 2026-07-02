import { describe, expect, it } from "vitest";
import { buildNativeSmsMirror } from "./nativeMirror";
import type { MerchantRuleRow, CategoryRow, BudgetItemRow, BudgetRow } from "@/lib/db";

/**
 * Bug A regression coverage: the native mirror must never fall back to
 * itemsById.get(rule.budget_item_id) without a month guard. Every rule in the
 * payload must resolve via resolveRuleItemId to a CURRENT-month item, or be
 * omitted entirely (native then shows a generic "wild spend" notification
 * instead of wrongly labeling it with last month's numbers).
 */

const NOW = new Date("2026-07-15T10:00:00Z"); // July 2026
const TPL = "tpl-1";

function budget(over: Partial<BudgetRow>): BudgetRow {
  return {
    id: "budget-jul",
    user_id: "u1",
    month: 7,
    year: 2026,
    total_budget: 50000,
    is_locked: false,
    template_id: TPL,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function cat(over: Partial<CategoryRow>): CategoryRow {
  return {
    id: "cat-1",
    budget_id: "budget-jul",
    user_id: "u1",
    name: "Food",
    icon: null,
    color: null,
    type: "needs",
    allocated_amount: 10000,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function item(over: Partial<BudgetItemRow>): BudgetItemRow {
  return {
    id: "item-1",
    category_id: "cat-1",
    user_id: "u1",
    name: "Groceries",
    emoji: null,
    planned_amount: 5000,
    actual_amount: 1000,
    is_completed: false,
    notes: null,
    link_type: null,
    link_id: null,
    template_id: null,
    template_item_id: null,
    created_at: "",
    updated_at: "",
    overspend_count: 0,
    ...over,
  };
}

function rule(over: Partial<MerchantRuleRow>): MerchantRuleRow {
  return {
    id: "rule-1",
    user_id: "u1",
    match_type: "contains",
    pattern: "zomato",
    merchant_normalized: "zomato",
    template_id: null,
    template_item_id: null,
    budget_item_id: null,
    category_id: null,
    auto_apply: true,
    times_applied: 0,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("buildNativeSmsMirror", () => {
  it("resolves a durable rule to the current month's item with correct labels", () => {
    const budgets = [budget({})];
    const cats = [cat({})];
    const items = [
      item({
        id: "item-jul",
        template_id: TPL,
        template_item_id: "ti-groceries",
        name: "Groceries",
        planned_amount: 5000,
        actual_amount: 2500,
        overspend_count: 1,
      }),
    ];
    const rules = [
      rule({ template_id: TPL, template_item_id: "ti-groceries", pattern: "zomato" }),
    ];

    const result = buildNativeSmsMirror({ rules, cats, items, budgets }, NOW);

    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]).toMatchObject({
      match_type: "contains",
      pattern: "zomato",
      category: "Food",
      allocated: 10000,
      spent: 2500,
      itemName: "Groceries",
      itemPlanned: 5000,
      itemActual: 2500,
      itemOverspendCount: 1,
    });
  });

  it("omits a durable rule whose template_id differs from the current budget's template", () => {
    const budgets = [budget({ template_id: TPL })];
    const cats = [cat({})];
    const items = [
      item({ id: "item-jul", template_id: "tpl-other", template_item_id: "ti-x" }),
    ];
    const rules = [rule({ template_id: "tpl-other", template_item_id: "ti-x" })];

    const result = buildNativeSmsMirror({ rules, cats, items, budgets }, NOW);

    expect(result.rules).toHaveLength(0);
  });

  it("includes a legacy rule (no template keys) cached to a current-month item", () => {
    const budgets = [budget({})];
    const cats = [cat({})];
    const items = [item({ id: "item-jul", name: "Groceries" })];
    const rules = [rule({ budget_item_id: "item-jul" })];

    const result = buildNativeSmsMirror({ rules, cats, items, budgets }, NOW);

    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].itemName).toBe("Groceries");
  });

  it("omits a legacy rule cached to a LAST-month item (Bug A regression)", () => {
    const budgets = [budget({})];
    // last month's category/item are NOT part of this month's budget.
    const cats = [cat({}), cat({ id: "cat-jun", budget_id: "budget-jun", name: "Food (Jun)" })];
    const items = [
      item({ id: "item-jun", category_id: "cat-jun", name: "Groceries (Jun)" }),
    ];
    const rules = [rule({ budget_item_id: "item-jun" })];

    const result = buildNativeSmsMirror({ rules, cats, items, budgets }, NOW);

    expect(result.rules).toHaveLength(0);
  });

  it("omits a rule when template_item_id is ambiguous (duplicate in current month)", () => {
    const budgets = [budget({})];
    const cats = [cat({})];
    const items = [
      item({ id: "item-a", template_id: TPL, template_item_id: "ti-dup" }),
      item({ id: "item-b", template_id: TPL, template_item_id: "ti-dup" }),
    ];
    const rules = [rule({ template_id: TPL, template_item_id: "ti-dup" })];

    const result = buildNativeSmsMirror({ rules, cats, items, budgets }, NOW);

    expect(result.rules).toHaveLength(0);
  });

  it("computes targets from current-month items only, even when an old item has a higher actual_amount, capped at 3", () => {
    const budgets = [budget({})];
    const cats = [cat({}), cat({ id: "cat-jun", budget_id: "budget-jun", name: "Food (Jun)" })];
    const items = [
      item({ id: "item-old-big", category_id: "cat-jun", name: "Old Big Spend", actual_amount: 999999 }),
      item({ id: "item-1", name: "A", actual_amount: 100 }),
      item({ id: "item-2", name: "B", actual_amount: 300 }),
      item({ id: "item-3", name: "C", actual_amount: 200 }),
      item({ id: "item-4", name: "D", actual_amount: 50 }),
    ];
    const rules: MerchantRuleRow[] = [];

    const result = buildNativeSmsMirror({ rules, cats, items, budgets }, NOW);

    expect(result.targets).toHaveLength(3);
    expect(result.targets.map((t) => t.id)).toEqual(["item-2", "item-3", "item-1"]);
    expect(result.targets.some((t) => t.id === "item-old-big")).toBe(false);
  });

  it("stamps period as zero-padded YYYY-MM of `now`", () => {
    const result = buildNativeSmsMirror(
      { rules: [], cats: [], items: [], budgets: [] },
      new Date("2026-01-05T00:00:00Z"),
    );
    expect(result.period).toBe("2026-01");
  });

  it("returns empty rules/targets but a stamped period when no current-month budget exists", () => {
    const result = buildNativeSmsMirror(
      {
        rules: [rule({ budget_item_id: "item-jun" })],
        cats: [cat({ id: "cat-jun", budget_id: "budget-jun" })],
        items: [item({ id: "item-jun", category_id: "cat-jun" })],
        budgets: [budget({ id: "budget-jun", month: 6, year: 2026 })],
      },
      NOW,
    );

    expect(result.rules).toHaveLength(0);
    expect(result.targets).toHaveLength(0);
    expect(result.period).toBe("2026-07");
  });
});
