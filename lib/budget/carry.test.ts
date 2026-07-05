import { describe, it, expect } from "vitest";
import {
  comparePeriods,
  stepPeriod,
  findCarrySource,
  isEmptyBudget,
  buildCarryPayload,
  type CarrySourceData,
} from "./carry";
import type { CategoryRow, BudgetItemRow } from "@/lib/db/AllocatDB";

function mkIdFactory(): () => string {
  let n = 0;
  return () => `uuid-${++n}`;
}

function cat(overrides: Partial<CategoryRow> & { id: string }): CategoryRow {
  return {
    budget_id: "b-src",
    user_id: "u1",
    name: "Needs",
    icon: "🏠",
    color: null,
    type: "misc",
    allocated_amount: 0,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

function item(
  overrides: Partial<BudgetItemRow> & { id: string; category_id: string }
): BudgetItemRow {
  return {
    user_id: "u1",
    name: "Rent",
    emoji: null,
    planned_amount: 0,
    actual_amount: 0,
    is_completed: false,
    notes: null,
    link_type: null,
    link_id: null,
    template_id: null,
    template_item_id: null,
    overspend_count: 0,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("comparePeriods", () => {
  it("orders within a year", () => {
    expect(comparePeriods({ month: 5, year: 2026 }, { month: 7, year: 2026 })).toBeLessThan(0);
    expect(comparePeriods({ month: 7, year: 2026 }, { month: 5, year: 2026 })).toBeGreaterThan(0);
    expect(comparePeriods({ month: 7, year: 2026 }, { month: 7, year: 2026 })).toBe(0);
  });

  it("is year-aware across boundaries", () => {
    expect(comparePeriods({ month: 12, year: 2025 }, { month: 1, year: 2026 })).toBeLessThan(0);
  });
});

describe("stepPeriod", () => {
  it("steps forward within a year", () => {
    expect(stepPeriod({ month: 6, year: 2026 }, 1)).toEqual({ month: 7, year: 2026 });
  });
  it("wraps Dec -> Jan forward", () => {
    expect(stepPeriod({ month: 12, year: 2026 }, 1)).toEqual({ month: 1, year: 2027 });
  });
  it("wraps Jan -> Dec backward", () => {
    expect(stepPeriod({ month: 1, year: 2026 }, -1)).toEqual({ month: 12, year: 2025 });
  });
});

describe("findCarrySource", () => {
  const target = { month: 8, year: 2026 };
  const budgets = [
    { id: "b-may", month: 5, year: 2026, total_budget: 40000, template_id: null },
    { id: "b-jun", month: 6, year: 2026, total_budget: 50000, template_id: "50-30-20" },
    { id: "b-jul", month: 7, year: 2026, total_budget: 0, template_id: null }, // phantom
    { id: "b-sep", month: 9, year: 2026, total_budget: 60000, template_id: null }, // future
  ];
  const counts = new Map([
    ["b-may", 3],
    ["b-jun", 3],
    ["b-jul", 0],
    ["b-sep", 2],
  ]);

  it("picks the most recent prior budget with categories, skipping phantom rows", () => {
    expect(findCarrySource(budgets, counts, target)?.id).toBe("b-jun");
  });

  it("skips over gap months (June budgeted, July skipped, opens August)", () => {
    const withoutJul = budgets.filter((b) => b.id !== "b-jul");
    expect(findCarrySource(withoutJul, counts, target)?.id).toBe("b-jun");
  });

  it("never picks a future budget", () => {
    const onlyFuture = budgets.filter((b) => b.id === "b-sep");
    expect(findCarrySource(onlyFuture, counts, target)).toBeNull();
  });

  it("returns null when no prior budget exists (first month ever)", () => {
    expect(findCarrySource([], counts, target)).toBeNull();
  });

  it("crosses year boundaries (Dec 2025 -> Jan 2026)", () => {
    const dec = [{ id: "b-dec", month: 12, year: 2025, total_budget: 30000, template_id: null }];
    expect(
      findCarrySource(dec, new Map([["b-dec", 1]]), { month: 1, year: 2026 })?.id
    ).toBe("b-dec");
  });

  it("skips prior budgets that have zero categories even with a total", () => {
    const b = [{ id: "b-jun", month: 6, year: 2026, total_budget: 50000, template_id: null }];
    expect(findCarrySource(b, new Map([["b-jun", 0]]), target)).toBeNull();
  });
});

describe("isEmptyBudget", () => {
  it("empty when no categories and zero total", () => {
    expect(isEmptyBudget({ totalBudget: 0, categories: [] })).toBe(true);
  });
  it("not empty with categories", () => {
    expect(isEmptyBudget({ totalBudget: 0, categories: [{}] })).toBe(false);
  });
  it("not empty with a total set", () => {
    expect(isEmptyBudget({ totalBudget: 100, categories: [] })).toBe(false);
  });
});

describe("buildCarryPayload", () => {
  function source(overrides?: Partial<CarrySourceData["budget"]>): CarrySourceData {
    const c1 = cat({ id: "c1", name: "Needs", allocated_amount: 25000, created_at: "2026-06-01T00:00:00Z" });
    const c2 = cat({ id: "c2", name: "Wants", allocated_amount: 15000, icon: "🎉", color: "lime", type: "wants", created_at: "2026-06-02T00:00:00Z" });
    const items = new Map<string, BudgetItemRow[]>([
      [
        "c1",
        [
          item({
            id: "i1",
            category_id: "c1",
            name: "Rent",
            planned_amount: 18000,
            actual_amount: 17500,
            is_completed: true,
            notes: "paid early",
            template_id: "50-30-20",
            template_item_id: "50-30-20:needs:rent",
            overspend_count: 2,
          }),
          item({
            id: "i2",
            category_id: "c1",
            name: "Gym",
            planned_amount: 2000,
            link_type: "asset",
            link_id: "asset-9",
            // manual item: no durable identity yet
          }),
        ],
      ],
      ["c2", [item({ id: "i3", category_id: "c2", name: "Dining", planned_amount: 5000, emoji: "🍕" })]],
    ]);
    return {
      budget: { id: "b-src", total_budget: 50000, template_id: "50-30-20", ...overrides },
      categories: [c2, c1], // intentionally unordered — builder must sort by created_at
      itemsByCategoryId: items,
    };
  }

  it("copies totals, categories and items with spend state reset", () => {
    const p = buildCarryPayload(source(), { month: 7, year: 2026, existingBudgetId: "b-jul" }, mkIdFactory());
    expect(p.month).toBe(7);
    expect(p.year).toBe(2026);
    expect(p.budgetId).toBe("b-jul");
    expect(p.budgetTempId).toBeNull();
    expect(p.sourceBudgetId).toBe("b-src");
    expect(p.totalBudget).toBe(50000);
    expect(p.categories).toHaveLength(2);
    // sorted by created_at: Needs first
    expect(p.categories[0].name).toBe("Needs");
    expect(p.categories[0].allocated_amount).toBe(25000);
    expect(p.categories[1].name).toBe("Wants");
    expect(p.categories[1].icon).toBe("🎉");
    expect(p.categories[1].color).toBe("lime");
    expect(p.categories[1].type).toBe("wants");
    const rent = p.categories[0].items[0];
    expect(rent.name).toBe("Rent");
    expect(rent.planned).toBe(18000);
    // spend state must NOT carry
    expect(p.categories.flatMap((c) => c.items).every((i) => i.tempId.startsWith("temp_"))).toBe(true);
    expect(p.categories.every((c) => c.tempId.startsWith("temp_"))).toBe(true);
  });

  it("carries template identity verbatim when present", () => {
    const p = buildCarryPayload(source(), { month: 7, year: 2026, existingBudgetId: "b-jul" }, mkIdFactory());
    expect(p.templateId).toBe("50-30-20");
    expect(p.mintedTemplateId).toBe(false);
    const rent = p.categories[0].items[0];
    expect(rent.templateItemId).toBe("50-30-20:needs:rent");
    expect(rent.stampSourceItemId).toBeNull();
  });

  it("mints identity for items without one and flags the source item for stamping", () => {
    const p = buildCarryPayload(source(), { month: 7, year: 2026, existingBudgetId: "b-jul" }, mkIdFactory());
    const gym = p.categories[0].items[1];
    expect(gym.templateItemId).not.toBeNull();
    expect(gym.stampSourceItemId).toBe("i2");
  });

  it("mints a synthetic carry template id when the source budget has none", () => {
    const p = buildCarryPayload(
      source({ template_id: null }),
      { month: 7, year: 2026, existingBudgetId: "b-jul" },
      mkIdFactory()
    );
    expect(p.templateId).toMatch(/^carry:/);
    expect(p.mintedTemplateId).toBe(true);
  });

  it("carries asset/debt links", () => {
    const p = buildCarryPayload(source(), { month: 7, year: 2026, existingBudgetId: "b-jul" }, mkIdFactory());
    const gym = p.categories[0].items[1];
    expect(gym.linkType).toBe("asset");
    expect(gym.linkId).toBe("asset-9");
  });

  it("mints a temp budget id when no local row exists", () => {
    const p = buildCarryPayload(source(), { month: 7, year: 2026, existingBudgetId: null }, mkIdFactory());
    expect(p.budgetId).toBeNull();
    expect(p.budgetTempId).toMatch(/^temp_/);
  });

  it("copies emoji and zeroes non-plan fields", () => {
    const p = buildCarryPayload(source(), { month: 7, year: 2026, existingBudgetId: "b-jul" }, mkIdFactory());
    const dining = p.categories[1].items[0];
    expect(dining.emoji).toBe("🍕");
    expect(dining.planned).toBe(5000);
  });
});
