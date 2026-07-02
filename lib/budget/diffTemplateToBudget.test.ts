import { describe, expect, it } from "vitest";
import {
  diffTemplateToBudget,
  type BudgetSideCategory,
  type TemplateSideCategory,
} from "./diffTemplateToBudget";

function budget(): BudgetSideCategory[] {
  return [
    {
      id: "cat-needs",
      name: "Needs",
      allocation: 1000,
      items: [
        {
          id: "it-rent",
          name: "Rent",
          template_item_id: "t:rent",
          planned_amount: 800,
          actual_amount: 0,
        },
        {
          id: "it-food",
          name: "Groceries",
          template_item_id: "t:food",
          planned_amount: 200,
          actual_amount: 50,
        },
      ],
    },
  ];
}

function template(): TemplateSideCategory[] {
  return [
    {
      name: "Needs",
      icon: "🏠",
      allocation: 1000,
      items: [
        { name: "Rent", templateItemId: "t:rent", allocation: 800 },
        { name: "Groceries", templateItemId: "t:food", allocation: 200 },
      ],
    },
  ];
}

describe("diffTemplateToBudget", () => {
  it("produces an empty diff when budget already mirrors the template", () => {
    const d = diffTemplateToBudget(budget(), template());
    expect(d.addCategories).toHaveLength(0);
    expect(d.addItems).toHaveLength(0);
    expect(d.updateItems).toHaveLength(0);
    expect(d.unlinkItems).toHaveLength(0);
    expect(d.deleteItems).toHaveLength(0);
  });

  it("adds a template item missing from an existing category", () => {
    const t = template();
    t[0].items.push({ name: "Utilities", templateItemId: "t:util", allocation: 100 });
    const d = diffTemplateToBudget(budget(), t);
    expect(d.addItems).toEqual([
      { categoryId: "cat-needs", name: "Utilities", templateItemId: "t:util", allocation: 100 },
    ]);
  });

  it("adds a whole new category with its items nested", () => {
    const t = template();
    t.push({
      name: "Wants",
      icon: "🎉",
      allocation: 500,
      items: [{ name: "Dining", templateItemId: "t:dining", allocation: 500 }],
    });
    const d = diffTemplateToBudget(budget(), t);
    expect(d.addCategories).toHaveLength(1);
    expect(d.addCategories[0].name).toBe("Wants");
    expect(d.addCategories[0].items[0].templateItemId).toBe("t:dining");
    expect(d.addItems).toHaveLength(0);
  });

  it("renames a matched item without touching amounts by default", () => {
    const t = template();
    t[0].items[0].name = "House Rent";
    t[0].items[0].allocation = 900; // amount change should be ignored
    const d = diffTemplateToBudget(budget(), t);
    expect(d.updateItems).toEqual([{ itemId: "it-rent", name: "House Rent" }]);
  });

  it("overwrites amounts (items + categories) only when opted in", () => {
    const t = template();
    t[0].allocation = 1200;
    t[0].items[0].allocation = 900;
    const d = diffTemplateToBudget(budget(), t, { overwriteAmounts: true });
    expect(d.updateItems).toEqual([{ itemId: "it-rent", planned_amount: 900 }]);
    expect(d.updateCategories).toEqual([
      { categoryId: "cat-needs", allocated_amount: 1200 },
    ]);
  });

  it("deletes a removed template item that has no spend", () => {
    const t = template();
    t[0].items = t[0].items.filter((i) => i.templateItemId !== "t:rent"); // rent has 0 actual
    const d = diffTemplateToBudget(budget(), t);
    expect(d.deleteItems).toEqual(["it-rent"]);
    expect(d.unlinkItems).toHaveLength(0);
  });

  it("keeps + unlinks a removed template item that has recorded spend", () => {
    const t = template();
    t[0].items = t[0].items.filter((i) => i.templateItemId !== "t:food"); // food has actual 50
    const d = diffTemplateToBudget(budget(), t);
    expect(d.unlinkItems).toEqual(["it-food"]);
    expect(d.deleteItems).toHaveLength(0);
  });

  it("never touches manually-added items (null template_item_id)", () => {
    const b = budget();
    b[0].items.push({
      id: "it-manual",
      name: "Snacks",
      template_item_id: null,
      planned_amount: 0,
      actual_amount: 0,
    });
    const d = diffTemplateToBudget(b, template());
    expect(d.deleteItems).toHaveLength(0);
    expect(d.unlinkItems).toHaveLength(0);
    expect(d.updateItems).toHaveLength(0);
  });
});
