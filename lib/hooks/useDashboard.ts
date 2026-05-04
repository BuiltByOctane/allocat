import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDashboardData } from "@/lib/actions/dashboard";
import { updateBudgetTotal, getCategoryItems, quickLogSpend } from "@/lib/actions/budget";
import { getDB } from "@/lib/db";
import { useEnqueue } from "@/lib/hooks/useSync";
import { computeMonthlyHistory } from "@/lib/utils/netWorthHistory";
import { computeAutoCompletion } from "@/lib/utils/budget-completion";

export const DASHBOARD_KEY = ["dashboard"] as const;

// ─── IDB read helper ──────────────────────────────────────────────────────────

export async function getDashboardFromIDB() {
  const db = getDB();

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const budget = await db.budgets
    .where("[month+year]")
    .equals([month, year])
    .first();

  let formattedBudget = null;
  const summaryCategories: { id: string; name: string; icon?: string | null }[] = [];

  if (budget) {
    const categories = await db.categories
      .where("budget_id")
      .equals(budget.id)
      .toArray();

    let spent = 0;
    for (const cat of categories) {
      summaryCategories.push({ id: cat.id, name: cat.name, icon: cat.icon });
      const items = await db.budget_items
        .where("category_id")
        .equals(cat.id)
        .toArray();
      items.forEach((i) => {
        spent += Number(i.actual_amount);
      });
    }

    formattedBudget = {
      id: budget.id,
      totalBudget: Number(budget.total_budget),
      spent,
      remaining: Number(budget.total_budget) - spent,
    };
  }

  // Goals are now assets with is_goal=true; surface only active ones for dashboard
  const allAssets = await db.assets.toArray();
  const goals = allAssets
    .filter((a) => a.is_goal === true && !a.achieved_at)
    .map((a) => ({
      id: a.id,
      user_id: a.user_id,
      name: a.name,
      icon: a.icon,
      target_amount: Number(a.target_amount ?? 0),
      current_amount: Number(a.value ?? 0),
      notes: null,
      priority: 0,
      created_at: a.created_at,
      updated_at: a.updated_at,
    }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Compute monthly net worth from asset_value_history (same as net worth page).
  // This stays accurate even when asset values are updated without add/delete.
  const allHistory = await db.asset_value_history.toArray();
  const debts = await db.debts.toArray();
  const totalLiabilities = debts
    .filter((d) => !d.is_closed && d.type !== "lent")
    .reduce((sum, d) => sum + (Number(d.principal) - Number(d.total_paid)), 0);
  const netWorthHistory = computeMonthlyHistory(allHistory, totalLiabilities, 12);

  return {
    budget: formattedBudget,
    categories: summaryCategories,
    goals,
    netWorthHistory,
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useDashboardData() {
  return useQuery({
    queryKey: DASHBOARD_KEY,
    queryFn: async () => {
      const local = await getDashboardFromIDB();
      // If IDB has at least budget or goals data, use it
      if (local.budget !== null || local.goals.length > 0) return local;
      // IDB empty — first load, fall back to server
      return getDashboardData();
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useUpdateBudgetTotal() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      budgetId,
      totalAmount,
    }: {
      budgetId: string;
      totalAmount: number;
    }) => {
      const db = getDB();
      await db.budgets.update(budgetId, {
        total_budget: totalAmount,
        updated_at: new Date().toISOString(),
      });
      await enqueue({
        table: "budgets",
        operation: "UPDATE",
        recordId: budgetId,
        payload: { budgetId, totalAmount },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
      qc.invalidateQueries({ queryKey: ["budget"] });
    },
  });
}

// Goal mutation hooks live in `lib/hooks/useGoals.ts` — they now operate on
// assets where is_goal=true. Re-export from here for any legacy callers.
export {
  useAddGoal,
  useUpdateGoal,
  useDeleteGoal,
  useUpdateGoalIcon,
  useAchieveGoalAsset,
} from "./useGoals";

/**
 * Fetches budget items for a given category — used by the Quick Spend item dropdown.
 * Reads from IDB; falls back to server if IDB returns empty.
 */
export function useCategoryItems(categoryId: string | null) {
  return useQuery({
    queryKey: ["categoryItems", categoryId],
    queryFn: async () => {
      if (!categoryId) return [];
      const db = getDB();
      const items = await db.budget_items
        .where("category_id")
        .equals(categoryId)
        .toArray();
      if (items.length > 0) return items;
      // IDB miss — fall back to server
      return getCategoryItems(categoryId);
    },
    enabled: !!categoryId,
    staleTime: 30_000,
  });
}

/**
 * Quick spend logs actual spend directly against a budget item.
 * Updates IDB `actual_amount` and enqueues PAYMENT for background sync.
 */
export function useQuickLogSpend() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({ itemId, amount }: { itemId: string; amount: number }) => {
      const db = getDB();
      const item = await db.budget_items.get(itemId);
      if (item) {
        const newActual = Number(item.actual_amount) + amount;
        const planned = Number(item.planned_amount);
        const nextCompleted = computeAutoCompletion(
          planned,
          newActual,
          Boolean(item.is_completed)
        );
        await db.budget_items.update(itemId, {
          actual_amount: newActual,
          is_completed: nextCompleted,
          updated_at: new Date().toISOString(),
        });
        await enqueue({
          table: "budget_items",
          operation: "PAYMENT",
          recordId: itemId,
          payload: { itemId, amount },
        });
        return {
          itemName: item.name,
          remaining: planned - newActual,
          planned,
          actual: newActual,
        };
      }
      // Item not in IDB yet — fall back to server action
      await quickLogSpend(itemId, amount);
      await enqueue({
        table: "budget_items",
        operation: "PAYMENT",
        recordId: itemId,
        payload: { itemId, amount },
      });
      return null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
      qc.invalidateQueries({ queryKey: ["budget"] });
      qc.invalidateQueries({ queryKey: ["categoryItems"] });
    },
  });
}
