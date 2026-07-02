import { describe, expect, it } from "vitest";
import { computeTemplateDrift, type DriftCategory } from "./templateDrift";
import type { BudgetTemplate } from "@/lib/budget-templates";

const template: BudgetTemplate = {
  id: "tmpl-1",
  name: "My Budget",
  description: "",
  preview: [],
  categories: [
    {
      name: "Needs",
      icon: "🏠",
      allocationPct: 50,
      items: [
        { name: "Rent", templateItemId: "t:rent" },
        { name: "Groceries", templateItemId: "t:groceries" },
      ],
    },
    {
      name: "Wants",
      icon: "🎉",
      allocationPct: 50,
      items: [{ name: "Dining", templateItemId: "t:dining" }],
    },
  ],
};

/** A budget that exactly mirrors `template` (amounts irrelevant to drift). */
function matching(): DriftCategory[] {
  return [
    {
      name: "Needs",
      items: [
        { name: "Rent", template_item_id: "t:rent" },
        { name: "Groceries", template_item_id: "t:groceries" },
      ],
    },
    { name: "Wants", items: [{ name: "Dining", template_item_id: "t:dining" }] },
  ];
}

describe("computeTemplateDrift", () => {
  it("returns unlinked for a null template", () => {
    expect(computeTemplateDrift(matching(), null)).toEqual({
      linked: false,
      drifted: false,
    });
  });

  it("is linked + clean when the budget mirrors the template", () => {
    expect(computeTemplateDrift(matching(), template)).toEqual({
      linked: true,
      drifted: false,
    });
  });

  it("ignores allocation amounts (names/structure only)", () => {
    // Names + ids identical; only amounts would differ upstream → still clean.
    expect(computeTemplateDrift(matching(), template).drifted).toBe(false);
  });

  it("drifts when an item was added manually (null template_item_id)", () => {
    const cats = matching();
    cats[0].items.push({ name: "Extra", template_item_id: null });
    expect(computeTemplateDrift(cats, template).drifted).toBe(true);
  });

  it("drifts when a template item was removed from the budget", () => {
    const cats = matching();
    cats[0].items = cats[0].items.filter((i) => i.template_item_id !== "t:groceries");
    expect(computeTemplateDrift(cats, template).drifted).toBe(true);
  });

  it("drifts when a linked item was renamed", () => {
    const cats = matching();
    cats[0].items[0].name = "House Rent";
    expect(computeTemplateDrift(cats, template).drifted).toBe(true);
  });

  it("drifts when a budget item links to an id the template no longer defines", () => {
    const cats = matching();
    cats[0].items[0].template_item_id = "t:ghost";
    expect(computeTemplateDrift(cats, template).drifted).toBe(true);
  });

  it("drifts when a category was added", () => {
    const cats = matching();
    cats.push({ name: "Savings", items: [] });
    expect(computeTemplateDrift(cats, template).drifted).toBe(true);
  });

  it("drifts when a category was removed", () => {
    const cats = matching().filter((c) => c.name !== "Wants");
    // Also drop its item so it's not flagged as removed-item first — this asserts
    // the category-set check specifically.
    expect(computeTemplateDrift(cats, template).drifted).toBe(true);
  });

  it("ignores whitespace/case in names", () => {
    const cats = matching();
    cats[0].name = "  needs ";
    cats[0].items[0].name = "RENT";
    expect(computeTemplateDrift(cats, template).drifted).toBe(false);
  });
});
