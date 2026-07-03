import type { BudgetTemplate } from "@/lib/budget-templates";

/**
 * Shared setup math for building a budget from a template or manual entry.
 * Centralizes logic previously duplicated between BudgetSetupSheet and
 * FirstBudgetCard. Pure — id generation is injected for testability.
 */

export interface SetupItem {
  id: string;
  name: string;
  allocation: number;
  linkType?: "asset" | "debt" | null;
  linkId?: string | null;
  /** Durable identity so SMS rules follow the item month to month. */
  templateItemId?: string | null;
  /** Real budget_items.id this form item was prefilled from (template-edit modes). */
  sourceItemId?: string | null;
}

export interface SetupCategory {
  id: string;
  name: string;
  icon: string | null;
  allocation: number;
  allocationPct: number | null; // auto-recalculates when total budget changes
  items: SetupItem[];
}

/** Rounded pct-of-total; 0 when pct is null or total is non-positive. */
export function allocationFromPct(pct: number | null, total: number): number {
  return pct !== null && total > 0 ? Math.round((pct / 100) * total) : 0;
}

/** Re-derive allocations for pct-driven categories after a total change. */
export function recalcPercentageAllocations<
  T extends { allocationPct: number | null; allocation: number }
>(categories: T[], totalBudget: number): T[] {
  return categories.map((cat) =>
    cat.allocationPct !== null
      ? { ...cat, allocation: allocationFromPct(cat.allocationPct, totalBudget) }
      : cat
  );
}

/** Convert a template into editable setup categories against a total budget. */
export function templateToSetupCategories(
  template: BudgetTemplate,
  totalBudget: number,
  mkId: () => string
): SetupCategory[] {
  return template.categories.map((cat) => ({
    id: mkId(),
    name: cat.name,
    icon: cat.icon,
    allocationPct: cat.allocationPct,
    allocation: allocationFromPct(cat.allocationPct, totalBudget),
    items: cat.items.map((item) => ({
      id: mkId(),
      name: item.name,
      allocation: item.plannedAmount ?? 0,
      linkType: item.linkType ?? null,
      linkId: item.linkId ?? null,
      templateItemId: item.templateItemId ?? null,
    })),
  }));
}

/**
 * Fit item planned amounts inside a category allocation: proportional scale +
 * largest-remainder rounding so the sum lands exactly on the allocation.
 * No-op when the amounts already fit or the allocation is 0.
 */
export function fitItemsToAllocation(
  items: Array<{ planned: number }>,
  allocation: number
): number[] {
  const planned = items.map((i) => i.planned);
  const sum = planned.reduce((a, b) => a + b, 0);
  if (allocation <= 0 || sum <= allocation || sum === 0) return planned;

  const exact = planned.map((p) => (p / sum) * allocation);
  const floored = exact.map(Math.floor);
  let remainder = allocation - floored.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ frac: v - Math.floor(v), i }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i] += 1;
    remainder -= 1;
  }
  return floored;
}

/**
 * Soft-validation resolution: the total actually saved. Over-allocated →
 * bump the total up to the allocated sum (surfaced to the user as
 * "Create — set total to Σ"); blank total with allocations → the sum
 * (zero-based mental model, silent).
 */
export function resolveEffectiveTotal(
  enteredTotal: number,
  totalAllocated: number
): { total: number; bumped: boolean } {
  const total = Math.max(enteredTotal, totalAllocated);
  return { total, bumped: totalAllocated > enteredTotal && enteredTotal > 0 };
}
