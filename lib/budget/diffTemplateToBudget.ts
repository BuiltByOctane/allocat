/**
 * Pure diff that maps an edited template onto the current month's budget so the
 * two stay in sync ("Edit template" applies template → budget). Structural by
 * default; amounts are only touched when `overwriteAmounts` is set (the user is
 * asked). Matching is by durable `templateItemId`; manually-added budget items
 * (null identity) are left untouched.
 *
 * Removal rule (confirmed with product): a template item that disappeared from
 * the template but has recorded spend this month is KEPT and unlinked; an
 * unspent one is deleted. Categories are additive — never auto-deleted.
 */

export interface TemplateSideItem {
  name: string;
  templateItemId: string;
  allocation: number;
}
export interface TemplateSideCategory {
  name: string;
  icon: string | null;
  allocation: number;
  items: TemplateSideItem[];
}

export interface BudgetSideItem {
  id: string;
  name: string;
  template_item_id: string | null;
  planned_amount: number;
  actual_amount: number;
}
export interface BudgetSideCategory {
  id: string;
  name: string;
  allocation: number;
  items: BudgetSideItem[];
}

export interface TemplateBudgetDiff {
  /** Template categories absent from the budget — insert category + its items. */
  addCategories: Array<{
    name: string;
    icon: string | null;
    allocation: number;
    items: Array<{ name: string; templateItemId: string; allocation: number }>;
  }>;
  /** Template items to add under an already-existing budget category. */
  addItems: Array<{
    categoryId: string;
    name: string;
    templateItemId: string;
    allocation: number;
  }>;
  /** In-place edits to existing budget items (rename and/or amount overwrite). */
  updateItems: Array<{ itemId: string; name?: string; planned_amount?: number }>;
  /** Category allocation overwrites (only emitted when overwriteAmounts). */
  updateCategories: Array<{ categoryId: string; allocated_amount: number }>;
  /** Removed-from-template items WITH spend → keep row, null out template link. */
  unlinkItems: string[];
  /** Removed-from-template items with NO spend → delete. */
  deleteItems: string[];
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function diffTemplateToBudget(
  budgetCategories: BudgetSideCategory[],
  templateCategories: TemplateSideCategory[],
  opts: { overwriteAmounts: boolean } = { overwriteAmounts: false }
): TemplateBudgetDiff {
  const diff: TemplateBudgetDiff = {
    addCategories: [],
    addItems: [],
    updateItems: [],
    updateCategories: [],
    unlinkItems: [],
    deleteItems: [],
  };

  // Index the budget side.
  const budgetItemById = new Map<
    string,
    { itemId: string; name: string; planned: number }
  >();
  for (const cat of budgetCategories) {
    for (const item of cat.items) {
      if (item.template_item_id == null) continue; // manual item — untouched
      budgetItemById.set(item.template_item_id, {
        itemId: item.id,
        name: item.name,
        planned: item.planned_amount,
      });
    }
  }
  const budgetCatByName = new Map<string, { categoryId: string; allocation: number }>();
  for (const cat of budgetCategories) {
    budgetCatByName.set(norm(cat.name), {
      categoryId: cat.id,
      allocation: cat.allocation,
    });
  }

  const templateIds = new Set<string>();

  for (const cat of templateCategories) {
    const existing = budgetCatByName.get(norm(cat.name));

    if (!existing) {
      diff.addCategories.push({
        name: cat.name,
        icon: cat.icon,
        allocation: cat.allocation,
        items: cat.items.map((i) => {
          templateIds.add(i.templateItemId);
          return {
            name: i.name,
            templateItemId: i.templateItemId,
            allocation: i.allocation,
          };
        }),
      });
      continue;
    }

    if (opts.overwriteAmounts && existing.allocation !== cat.allocation) {
      diff.updateCategories.push({
        categoryId: existing.categoryId,
        allocated_amount: cat.allocation,
      });
    }

    for (const item of cat.items) {
      templateIds.add(item.templateItemId);
      const match = budgetItemById.get(item.templateItemId);
      if (!match) {
        diff.addItems.push({
          categoryId: existing.categoryId,
          name: item.name,
          templateItemId: item.templateItemId,
          allocation: item.allocation,
        });
        continue;
      }
      const update: { itemId: string; name?: string; planned_amount?: number } = {
        itemId: match.itemId,
      };
      if (norm(match.name) !== norm(item.name)) update.name = item.name;
      if (opts.overwriteAmounts && match.planned !== item.allocation) {
        update.planned_amount = item.allocation;
      }
      if (update.name !== undefined || update.planned_amount !== undefined) {
        diff.updateItems.push(update);
      }
    }
  }

  // Items removed from the template.
  for (const cat of budgetCategories) {
    for (const item of cat.items) {
      if (item.template_item_id == null) continue;
      if (templateIds.has(item.template_item_id)) continue;
      if (item.actual_amount > 0) diff.unlinkItems.push(item.id);
      else diff.deleteItems.push(item.id);
    }
  }

  return diff;
}
