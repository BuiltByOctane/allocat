import type { BudgetTemplate } from "@/lib/budget-templates";

/** Minimal budget-item projection needed to detect structural drift. */
export interface DriftItem {
  name: string;
  /** Durable template identity; null for items added manually after apply. */
  template_item_id: string | null;
}

export interface DriftCategory {
  name: string;
  items: DriftItem[];
}

/** Trim + lowercase so whitespace/case tweaks don't read as a rename. */
function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Decide whether a budget still matches the template it was built from.
 *
 * Drift is STRUCTURAL only — allocation-amount changes are ignored (percentage
 * templates make amount comparison lossy). Matching is by durable
 * `template_item_id`, exactly like SMS rule resolution (lib/sms/resolveRuleItem.ts).
 *
 * `drifted` is true if ANY of:
 *   1. a budget item carries no `template_item_id` (added manually after apply),
 *   2. a template item id is absent from the budget (item removed),
 *   3. a budget item's id matches a template item but the name differs (renamed),
 *      or its id isn't in the template at all (stale/foreign link),
 *   4. the category-name sets differ (category added/removed/renamed).
 */
export function computeTemplateDrift(
  categories: DriftCategory[],
  template: BudgetTemplate | null | undefined
): { linked: boolean; drifted: boolean } {
  if (!template) return { linked: false, drifted: false };

  // template id -> normalized name
  const templateItems = new Map<string, string>();
  for (const cat of template.categories) {
    for (const item of cat.items) {
      templateItems.set(item.templateItemId, norm(item.name));
    }
  }

  const budgetItemIds = new Set<string>();
  for (const cat of categories) {
    for (const item of cat.items) {
      // 1. manually-added item — no durable identity
      if (item.template_item_id == null) return { linked: true, drifted: true };
      budgetItemIds.add(item.template_item_id);
      const templateName = templateItems.get(item.template_item_id);
      // 3. renamed, or linked to an id this template no longer defines
      if (templateName === undefined || templateName !== norm(item.name)) {
        return { linked: true, drifted: true };
      }
    }
  }

  // 2. a template item that no longer exists in the budget
  for (const id of templateItems.keys()) {
    if (!budgetItemIds.has(id)) return { linked: true, drifted: true };
  }

  // 4. category set changed
  const budgetCats = new Set(categories.map((c) => norm(c.name)));
  const templateCats = new Set(template.categories.map((c) => norm(c.name)));
  if (budgetCats.size !== templateCats.size) return { linked: true, drifted: true };
  for (const name of templateCats) {
    if (!budgetCats.has(name)) return { linked: true, drifted: true };
  }

  return { linked: true, drifted: false };
}
