import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDB } from "@/lib/db";
import { useEnqueue } from "@/lib/hooks/useSync";
import { NET_WORTH_KEY } from "@/lib/hooks/useNetWorth";
import { DASHBOARD_KEY } from "@/lib/hooks/useDashboard";

export const GOALS_KEY = ["goals"] as const;

/**
 * After the goals→assets merge, goals are just assets with `is_goal = true`.
 * The shape returned here mirrors the legacy GoalRow used by GoalsPage.
 */
export interface GoalRow {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  target_amount: number;
  current_amount: number;
  notes: string | null;
  priority: number;
  achieved_at: string | null;
  asset_id: string;
  created_at: string;
  updated_at: string;
}

async function getGoalsFromIDB(): Promise<GoalRow[]> {
  const db = getDB();
  const all = await db.assets.toArray();
  return all
    .filter((a) => a.is_goal === true)
    .map(toGoalRow)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGoalRow(asset: any): GoalRow {
  return {
    id: asset.id,
    user_id: asset.user_id,
    name: asset.name,
    icon: asset.icon ?? null,
    color: asset.color ?? null,
    target_amount: Number(asset.target_amount ?? 0),
    current_amount: Number(asset.value ?? 0),
    notes: null,
    priority: 0,
    achieved_at: asset.achieved_at ?? null,
    asset_id: asset.id,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
  };
}

async function ensureGoalsAssetCategoryId(userId: string): Promise<string | null> {
  const db = getDB();
  const all = await db.asset_categories.toArray();
  const found = all.find((c) => c.user_id === userId && c.name === "Goals");
  if (found) return found.id;
  // Optimistically create — server addAsset also auto-creates if missing.
  const tempId = `temp_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await db.asset_categories.add({
    id: tempId,
    user_id: userId,
    name: "Goals",
    icon: "🎯",
    color: null,
    created_at: now,
  });
  return tempId;
}

export function useGoalsData() {
  return useQuery({
    queryKey: GOALS_KEY,
    queryFn: getGoalsFromIDB,
  });
}

export function useAddGoal() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      name,
      targetAmount,
      icon,
    }: {
      name: string;
      targetAmount: number;
      notes?: string | null;
      priority?: number;
      icon?: string | null;
    }) => {
      const db = getDB();
      const tempId = `temp_${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const today = now.split("T")[0];

      // Resolve user id from any existing asset/category row in IDB
      const sample = await db.asset_categories.toCollection().first();
      const userId = sample?.user_id ?? "__pending__";
      const categoryId = await ensureGoalsAssetCategoryId(userId);

      await db.assets.add({
        id: tempId,
        user_id: userId,
        name,
        icon: icon ?? null,
        color: null,
        category: null,
        category_id: categoryId,
        value: 0,
        invested_amount: 0,
        is_goal: true,
        target_amount: targetAmount,
        achieved_at: null,
        created_at: now,
        updated_at: now,
      });

      await db.asset_value_history.add({
        id: `temp_hist_${crypto.randomUUID()}`,
        asset_id: tempId,
        user_id: userId,
        entry_type: "initial",
        amount: 0,
        running_total: 0,
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
          value: 0,
          icon: icon ?? null,
          isGoal: true,
          targetAmount,
        },
      });

      return { id: tempId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GOALS_KEY });
      qc.invalidateQueries({ queryKey: NET_WORTH_KEY });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}

export function useUpdateGoal() {
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
        target_amount?: number;
        current_amount?: number;
        notes?: string | null;
        priority?: number;
        color?: string | null;
      };
    }) => {
      const db = getDB();
      const idbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const serverUpdates: Record<string, unknown> = {};

      if (updates.name !== undefined) {
        idbPatch.name = updates.name;
        serverUpdates.name = updates.name;
      }
      if (updates.target_amount !== undefined) {
        idbPatch.target_amount = updates.target_amount;
        serverUpdates.target_amount = updates.target_amount;
      }
      if (updates.current_amount !== undefined) {
        // Goal "current amount" maps to asset value. Bump via add_funds entry
        // so history stays correct; clamp deltas at zero.
        const asset = await db.assets.get(id);
        if (asset) {
          const delta = Number(updates.current_amount) - Number(asset.value);
          idbPatch.value = Number(updates.current_amount);
          idbPatch.invested_amount =
            Number(asset.invested_amount ?? asset.value) + delta;
          serverUpdates.value = Number(updates.current_amount);
        }
      }

      if (updates.color !== undefined) {
        idbPatch.color = updates.color;
        serverUpdates.color = updates.color;
      }

      await db.assets.update(id, idbPatch);

      await enqueue({
        table: "assets",
        operation: "UPDATE",
        recordId: id,
        payload: { id, updates: serverUpdates },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GOALS_KEY });
      qc.invalidateQueries({ queryKey: NET_WORTH_KEY });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async (id: string) => {
      const db = getDB();
      await db.assets.delete(id);
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
      qc.invalidateQueries({ queryKey: GOALS_KEY });
      qc.invalidateQueries({ queryKey: NET_WORTH_KEY });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}

export function useUpdateGoalIcon() {
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
      qc.invalidateQueries({ queryKey: GOALS_KEY });
      qc.invalidateQueries({ queryKey: NET_WORTH_KEY });
    },
  });
}

export function useAchieveGoalAsset() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async (id: string) => {
      const db = getDB();
      const asset = await db.assets.get(id);
      if (!asset) return;
      const previousValue = Number(asset.value);
      const nowIso = new Date().toISOString();
      const today = nowIso.split("T")[0];

      if (previousValue > 0) {
        await db.asset_value_history.add({
          id: `temp_hist_${crypto.randomUUID()}`,
          asset_id: id,
          user_id: asset.user_id,
          entry_type: "withdraw",
          amount: previousValue,
          running_total: 0,
          note: "Goal achieved",
          entry_date: today,
          created_at: nowIso,
        });
      }

      await db.assets.update(id, {
        value: 0,
        invested_amount: 0,
        achieved_at: nowIso,
        updated_at: nowIso,
      });

      // Sweep linked budget items in IDB
      const linkedItems = await db.budget_items
        .where({ link_type: "asset", link_id: id })
        .toArray();
      for (const item of linkedItems) {
        await db.budget_items.update(item.id, { link_type: null, link_id: null });
      }

      await enqueue({
        table: "assets",
        operation: "ACHIEVE",
        recordId: id,
        payload: { id },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GOALS_KEY });
      qc.invalidateQueries({ queryKey: NET_WORTH_KEY });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}
