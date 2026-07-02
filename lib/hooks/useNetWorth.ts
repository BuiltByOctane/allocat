import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getNetWorthData } from "@/lib/actions/net-worth";
import { getDB } from "@/lib/db";
import { useEnqueue } from "@/lib/hooks/useSync";
import { DASHBOARD_KEY } from "./useDashboard";
import { computeMonthlyHistory } from "@/lib/utils/netWorthHistory";

export const NET_WORTH_KEY = ["net-worth"] as const;

// ─── IDB read helper ──────────────────────────────────────────────────────────

export async function getNetWorthFromIDB() {
  const db = getDB();
  const allAssets = await db.assets.orderBy("created_at").toArray();
  // Achieved goal-assets are excluded from net worth list
  const assets = allAssets.filter((a) => !a.achieved_at);

  if (assets.length === 0) {
    const debtCount = await db.debts.count();
    if (debtCount === 0) return null;
  }

  // Independent reads — batch in parallel.
  const [categories, debts, history] = await Promise.all([
    db.asset_categories.toArray(),
    db.debts.toArray(),
    db.asset_value_history.toArray(),
  ]);
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const normalizedAssets = assets.map((a) => {
    const cat = a.category_id ? catMap.get(a.category_id) : null;
    return {
      id: a.id,
      user_id: a.user_id,
      name: a.name,
      icon: a.icon,
      color: a.color ?? null,
      category_id: a.category_id ?? null,
      category_name: cat?.name ?? a.category ?? "Other",
      category_icon: cat?.icon ?? "📦",
      value: Number(a.value),
      invested_amount: Number(a.invested_amount ?? a.value),
      is_goal: Boolean(a.is_goal),
      target_amount: a.target_amount != null ? Number(a.target_amount) : null,
      achieved_at: a.achieved_at ?? null,
      created_at: a.created_at,
      updated_at: a.updated_at,
    };
  });

  const totalLiabilities = debts
    .filter((d) => !d.is_closed && d.type !== "lent")
    .reduce((sum, d) => sum + (Number(d.principal) - Number(d.total_paid)), 0);

  return {
    assets: normalizedAssets,
    totalLiabilities,
    netWorthHistory: computeMonthlyHistory(history, totalLiabilities, 12),
  };
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function useNetWorthData() {
  return useQuery({
    queryKey: NET_WORTH_KEY,
    queryFn: async () => {
      const local = await getNetWorthFromIDB();
      if (local) return local;
      return getNetWorthData();
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useAddAsset() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      name,
      categoryId,
      value,
      icon,
      isGoal = false,
      targetAmount = null,
    }: {
      name: string;
      categoryId: string | null;
      value: number;
      icon?: string | null;
      isGoal?: boolean;
      targetAmount?: number | null;
    }) => {
      const db = getDB();
      const tempId = `temp_${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const today = now.split("T")[0];

      await db.assets.add({
        id: tempId,
        user_id: "__pending__",
        name,
        icon: icon ?? null,
        color: null,
        category: null,
        category_id: categoryId,
        value,
        invested_amount: value,
        is_goal: isGoal,
        target_amount: isGoal ? targetAmount : null,
        achieved_at: null,
        created_at: now,
        updated_at: now,
      });

      // Record initial history entry locally
      await db.asset_value_history.add({
        id: `temp_hist_${crypto.randomUUID()}`,
        asset_id: tempId,
        user_id: "__pending__",
        entry_type: "initial",
        amount: value,
        running_total: value,
        note: null,
        entry_date: today,
        created_at: now,
      });

      await enqueue({
        table: "assets",
        operation: "INSERT",
        recordId: tempId,
        tempId,
        payload: {
          name,
          categoryId,
          value,
          icon: icon ?? null,
          isGoal,
          targetAmount: isGoal ? targetAmount : null,
        },
      });

      return { id: tempId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NET_WORTH_KEY });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}

export function useUpdateAsset() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        name?: string;
        icon?: string;
        color?: string | null;
        category_id?: string | null;
        is_goal?: boolean;
        target_amount?: number | null;
      };
    }) => {
      const db = getDB();
      const idbPatch: Record<string, unknown> = {
        ...updates,
        updated_at: new Date().toISOString(),
      };
      // Mirror server semantics: toggling is_goal off clears goal fields
      if (updates.is_goal === false) {
        idbPatch.target_amount = null;
        idbPatch.achieved_at = null;
      }
      await db.assets.update(id, idbPatch);
      await enqueue({
        table: "assets",
        operation: "UPDATE",
        recordId: id,
        payload: { id, updates },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NET_WORTH_KEY });
      // is_goal/target_amount changes surface on Dashboard + Goals — refresh both.
      // ["goals"] used as a literal to avoid a useGoals↔useNetWorth import cycle.
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

export function useUpdateAssetIcon() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({ id, icon }: { id: string; icon: string }) => {
      const db = getDB();
      await db.assets.update(id, { icon, updated_at: new Date().toISOString() });
      await enqueue({
        table: "assets",
        operation: "UPDATE",
        recordId: id,
        payload: { id, updates: { icon } },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NET_WORTH_KEY });
      // A goal-asset's icon also shows on Dashboard + Goals.
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async (id: string) => {
      const db = getDB();
      await db.assets.delete(id);

      // Clear linked references in IDB so cascades don't fire on stale ids.
      // Server-side triggers handle the same cleanup once sync flushes.
      const linkedItems = await db.budget_items
        .where({ link_type: "asset", link_id: id })
        .toArray();
      for (const item of linkedItems) {
        await db.budget_items.update(item.id, { link_type: null, link_id: null });
      }

      await enqueue({
        table: "assets",
        operation: "DELETE",
        recordId: id,
        payload: { id },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NET_WORTH_KEY });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}
