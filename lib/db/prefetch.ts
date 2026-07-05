import type { QueryClient } from "@tanstack/react-query";
import { getDashboardFromIDB } from "@/lib/hooks/useDashboard";
import { getBudgetFromIDB, budgetKey } from "@/lib/hooks/useBudget";
import { getNetWorthFromIDB } from "@/lib/hooks/useNetWorth";
import { getDebtFromIDB } from "@/lib/hooks/useDebt";
import { getDashboardData } from "@/lib/actions/dashboard";
import { getBudgetView } from "@/lib/actions/budget";
import { getNetWorthData } from "@/lib/actions/net-worth";
import { getDebtData } from "@/lib/actions/debt";
import { DASHBOARD_KEY } from "@/lib/hooks/useDashboard";
import { NET_WORTH_KEY } from "@/lib/hooks/useNetWorth";
import { DEBT_KEY } from "@/lib/hooks/useDebt";

/**
 * Populates the React Query in-memory cache from IDB after hydration.
 * Uses fetchQuery (not prefetchQuery) so it ALWAYS re-runs after each
 * hydrateAllTables call — staleTime:Infinity would cause prefetchQuery
 * to skip already-cached entries, serving stale data across page loads.
 */
export async function prefetchAllQueries(qc: QueryClient): Promise<void> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  await Promise.all([
    // Dashboard
    qc.fetchQuery({
      queryKey: DASHBOARD_KEY,
      queryFn: async () => {
        const local = await getDashboardFromIDB();
        if (local.budget !== null || local.goals.length > 0) return local;
        return getDashboardData();
      },
    }),

    // Budget (current month) — read-only: a passive prefetch must never create
    // a phantom zero-value budget row (mirrors useBudgetData's virtual-empty).
    qc.fetchQuery({
      queryKey: budgetKey(month, year),
      queryFn: async () => {
        const local = await getBudgetFromIDB(month, year);
        if (local) return local;
        const view = await getBudgetView(month, year);
        if (view) return view;
        return { id: "", month, year, totalBudget: 0, templateId: null, categories: [] };
      },
    }),

    // Net Worth
    qc.fetchQuery({
      queryKey: NET_WORTH_KEY,
      queryFn: async () => {
        const local = await getNetWorthFromIDB();
        if (local) return local;
        return getNetWorthData();
      },
    }),

    // Debt
    qc.fetchQuery({
      queryKey: DEBT_KEY,
      queryFn: async () => {
        const local = await getDebtFromIDB();
        if (local) return local;
        return getDebtData();
      },
    }),
  ]);
}
