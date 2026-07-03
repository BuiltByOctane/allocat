import type { BudgetRow, CategoryRow, BudgetItemRow } from "@/lib/db/AllocatDB";

/**
 * Pure carry-forward logic: pick the source budget for a new month and build
 * the CARRY_SETUP payload that copies its structure with spend state reset.
 * No Dexie/network imports — unit-testable with plain objects. Consumed by
 * lib/hooks/useBudgetCarry.ts (client) and lib/actions/budget.ts (server).
 */

export interface CarryPeriod {
  month: number; // 1-based
  year: number;
}

/** -1 when a is before b, 1 when after, 0 when equal. Year-aware. */
export function comparePeriods(a: CarryPeriod, b: CarryPeriod): number {
  const av = a.year * 12 + (a.month - 1);
  const bv = b.year * 12 + (b.month - 1);
  return av < bv ? -1 : av > bv ? 1 : 0;
}

/** Step one month forward/backward, wrapping across year boundaries. */
export function stepPeriod(p: CarryPeriod, delta: 1 | -1): CarryPeriod {
  const idx = p.year * 12 + (p.month - 1) + delta;
  return { month: (idx % 12) + 1, year: Math.floor(idx / 12) };
}

/**
 * sync_meta key recording carry state for a period (per device). Lives here
 * (not in the hook) so SyncEngine can clear it on conflict/rollback without
 * importing React code.
 */
export function carryMarkerKey(month: number, year: number): string {
  return `__carry__${year}-${month}`;
}

type CarrySourceBudget = Pick<
  BudgetRow,
  "id" | "month" | "year" | "total_budget" | "template_id"
>;

/**
 * Most recent budget strictly before `target` that has at least one category.
 * Skips phantom rows (prefetch creates empty budgets for the current month).
 */
export function findCarrySource(
  budgets: CarrySourceBudget[],
  categoryCountByBudgetId: Map<string, number>,
  target: CarryPeriod
): CarrySourceBudget | null {
  let best: CarrySourceBudget | null = null;
  for (const b of budgets) {
    if (comparePeriods(b, target) >= 0) continue;
    if ((categoryCountByBudgetId.get(b.id) ?? 0) < 1) continue;
    if (best === null || comparePeriods(b, best) > 0) best = b;
  }
  return best;
}

/** A month is carry-eligible as a TARGET when it has no categories and total 0. */
export function isEmptyBudget(b: {
  totalBudget: number;
  categories: unknown[];
}): boolean {
  return b.categories.length === 0 && b.totalBudget === 0;
}

export interface CarrySourceData {
  budget: Pick<BudgetRow, "id" | "total_budget" | "template_id">;
  categories: CategoryRow[];
  itemsByCategoryId: Map<string, BudgetItemRow[]>;
}

export interface CarryItemPayload {
  tempId: string;
  name: string;
  emoji: string | null;
  planned: number;
  linkType: "asset" | "debt" | null;
  linkId: string | null;
  templateItemId: string | null;
  /** Source budget_items.id to back-stamp when identity was minted here (else null). */
  stampSourceItemId: string | null;
}

export interface CarryCategoryPayload {
  tempId: string;
  name: string;
  icon: string | null;
  color: string | null;
  type: CategoryRow["type"];
  allocated_amount: number;
  items: CarryItemPayload[];
}

export interface CarryPayload {
  month: number;
  year: number;
  /** temp_ id when no local budget row existed; null when reusing a real row. */
  budgetTempId: string | null;
  /** The existing (real or prefetch-created) row id; null when budgetTempId is set. */
  budgetId: string | null;
  sourceBudgetId: string;
  totalBudget: number;
  /** Carried from the source, or freshly minted `carry:<uuid>`. */
  templateId: string;
  /** True when templateId was minted here → server must also stamp the SOURCE budget. */
  mintedTemplateId: boolean;
  categories: CarryCategoryPayload[];
}

const byCreatedAt = (a: { created_at: string }, b: { created_at: string }) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;

/**
 * Build the carry payload from a source budget. Copies structure + planned
 * amounts; resets all spend state (actuals, completion, notes, overspend).
 * Items lacking durable identity get one minted, with `stampSourceItemId` set
 * so the server upgrades the source item + its merchant_rules in the same
 * transaction (keeps SMS auto-allocation following the item across months).
 */
export function buildCarryPayload(
  source: CarrySourceData,
  target: { month: number; year: number; existingBudgetId: string | null },
  mkId: () => string
): CarryPayload {
  const templateId = source.budget.template_id ?? `carry:${mkId()}`;
  const mintedTemplateId = source.budget.template_id === null;

  const categories = [...source.categories].sort(byCreatedAt).map((cat) => {
    const items = [...(source.itemsByCategoryId.get(cat.id) ?? [])]
      .sort(byCreatedAt)
      .map((it): CarryItemPayload => {
        const hasIdentity = it.template_item_id !== null;
        return {
          tempId: `temp_${mkId()}`,
          name: it.name,
          emoji: it.emoji,
          planned: it.planned_amount,
          linkType: it.link_type,
          linkId: it.link_id,
          templateItemId: hasIdentity ? it.template_item_id : mkId(),
          stampSourceItemId: hasIdentity ? null : it.id,
        };
      });
    return {
      tempId: `temp_${mkId()}`,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      type: cat.type,
      allocated_amount: cat.allocated_amount,
      items,
    };
  });

  return {
    month: target.month,
    year: target.year,
    budgetTempId: target.existingBudgetId === null ? `temp_${mkId()}` : null,
    budgetId: target.existingBudgetId,
    sourceBudgetId: source.budget.id,
    totalBudget: source.budget.total_budget,
    templateId,
    mintedTemplateId,
    categories,
  };
}
