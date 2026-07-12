import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDashboardData } from "@/lib/actions/dashboard";
import { updateBudgetTotal, getCategoryItems, quickLogSpend } from "@/lib/actions/budget";
import { getDB } from "@/lib/db";
import { useEnqueue } from "@/lib/hooks/useSync";
import { computeMonthlyHistory } from "@/lib/utils/netWorthHistory";
import { computeAutoCompletion } from "@/lib/utils/budget-completion";
import { applyLinkedSpendCascadeIDB } from "@/lib/utils/budget-cascade";
import {
  writeManualTransaction,
  ALL_TX_KEY,
  ITEM_TX_KEY,
  SMS_CATEGORIZED_KEY,
} from "@/lib/hooks/useSmsTransactions";

export const DASHBOARD_KEY = ["dashboard"] as const;

// ─── IDB read helper ──────────────────────────────────────────────────────────

export async function getDashboardFromIDB() {
  const db = getDB();

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Independent table reads — kick off in parallel with the budget chain below.
  const independent = Promise.all([
    db.assets.toArray(),
    db.asset_value_history.toArray(),
    db.debts.toArray(),
  ]);

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

    const categoryIds = categories.map((c) => c.id);
    categories.forEach((cat) =>
      summaryCategories.push({ id: cat.id, name: cat.name, icon: cat.icon })
    );

    // Single bulk read instead of one query per category.
    const items = await db.budget_items
      .where("category_id")
      .anyOf(categoryIds)
      .toArray();
    const spent = items.reduce((sum, i) => sum + Number(i.actual_amount), 0);

    formattedBudget = {
      id: budget.id,
      totalBudget: Number(budget.total_budget),
      spent,
      remaining: Number(budget.total_budget) - spent,
    };
  }

  const [allAssets, allHistory, debts] = await independent;

  // Goals are now assets with is_goal=true; surface only active ones for dashboard
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
  // `allHistory` and `debts` were read in parallel above.
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
      // The category detail screen shows total budget (for over-allocation math).
      qc.invalidateQueries({ queryKey: ["categoryData"] });
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
    mutationFn: async ({
      itemId,
      amount,
      label,
    }: {
      itemId: string;
      amount: number;
      /** Optional name for the ledger transaction row. */
      label?: string | null;
    }) => {
      const db = getDB();
      // Profile currency for the ledger row (falls back to INR).
      const profiles = await db.profiles.toArray();
      const currency = profiles[0]?.currency ?? "INR";
      const item = await db.budget_items.get(itemId);
      if (item) {
        const newActual = Number(item.actual_amount) + amount;
        const planned = Number(item.planned_amount);
        const nextCompleted = computeAutoCompletion(planned, newActual);
        await db.budget_items.update(itemId, {
          actual_amount: newActual,
          is_completed: nextCompleted,
          updated_at: new Date().toISOString(),
        });
        // Mirror the server cascade optimistically: a spend on an asset/debt-
        // linked item moves the linked target now (server quickLogSpend does the
        // same via addAssetEntry/makePayment). Matches the item-sheet path.
        await applyLinkedSpendCascadeIDB(item, { actual_amount: newActual });
        await enqueue({
          table: "budget_items",
          operation: "PAYMENT",
          recordId: itemId,
          payload: { itemId, amount },
        });
        // Ledger record only — the PAYMENT above already bumped actual_amount, so
        // the manual transaction's server insert must NOT re-apply the spend.
        await writeManualTransaction(
          { budgetItemId: itemId, amount, currency, label: label ?? null },
          { enqueue },
        );
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
      await writeManualTransaction(
        { budgetItemId: itemId, amount, currency, label: label ?? null },
        { enqueue },
      );
      return null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
      qc.invalidateQueries({ queryKey: ["budget"] });
      qc.invalidateQueries({ queryKey: ["categoryItems"] });
      // A logged spend bumps the item's actual on the category detail screen too.
      qc.invalidateQueries({ queryKey: ["categoryData"] });
      // Linked asset/debt targets moved via the cascade above (literals avoid an
      // import cycle with useNetWorth/useGoals/useDebt).
      qc.invalidateQueries({ queryKey: ["net-worth"] });
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["debt"] });
      // The ledger row shows in the history + per-item list.
      qc.invalidateQueries({ queryKey: ALL_TX_KEY });
      qc.invalidateQueries({ queryKey: ITEM_TX_KEY });
      qc.invalidateQueries({ queryKey: SMS_CATEGORIZED_KEY });
    },
  });
}
