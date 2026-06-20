/**
 * Shared "does the user have any real financial data?" predicate.
 *
 * The dashboard empty state and the Home first-run checklist must agree on what
 * "empty" means. Keying off the mere *presence* of a budget row is wrong: opening
 * the Budget page can create a zero-value budget row, which would otherwise flip
 * the dashboard out of its empty state into a UI full of zeros. Treat a budget as
 * meaningful only when it has a positive total OR at least one category.
 */

export interface DashboardEmptySource {
  budget: { totalBudget: number } | null;
  categories?: { id: string }[];
  goals: unknown[];
  netWorthHistory: unknown[];
}

export function hasMeaningfulData(
  data: DashboardEmptySource | null | undefined
): boolean {
  if (!data) return false;
  const budgetHasContent =
    !!data.budget &&
    (Number(data.budget.totalBudget) > 0 || (data.categories?.length ?? 0) > 0);
  return (
    budgetHasContent ||
    data.goals.length > 0 ||
    data.netWorthHistory.length > 0
  );
}

export function isDashboardEmpty(
  data: DashboardEmptySource | null | undefined
): boolean {
  return !hasMeaningfulData(data);
}
