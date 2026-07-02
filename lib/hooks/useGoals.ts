import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDB } from "@/lib/db";
import type { SyncQueueItem } from "@/lib/db";
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

type EnqueueFn = (
  item: Omit<SyncQueueItem, "id" | "retries" | "status" | "createdAt">,
) => Promise<void>;

async function ensureGoalsAssetCategoryId(
  userId: string,
  enqueue: EnqueueFn,
): Promise<string | null> {
  const db = getDB();
  const all = await db.asset_categories.toArray();
  const found = all.find((c) => c.user_id === userId && c.name === "Goals");
  if (found) {
    // A real (server) id is always safe to use.
    if (!found.id.startsWith("temp_")) return found.id;
    // A temp id is only safe if it still has a live sync producer (or already
    // resolved). A leftover orphan from a previously failed attempt has
    // neither — re-enqueue its INSERT under the SAME temp id so any asset that
    // references it can resolve, instead of failing as a doomed dependency.
    if (await tempHasProducer(found.id)) return found.id;
    await enqueueGoalsCategoryInsert(found.id, found.icon ?? "🎯", enqueue);
    return found.id;
  }
  // Optimistically create AND enqueue its INSERT. The asset INSERT below
  // references this temp categoryId, so the category must have a sync producer —
  // otherwise SyncEngine flags the asset as a doomed dependency ("dependency
  // never synced") and rolls the goal back.
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
  await enqueueGoalsCategoryInsert(tempId, "🎯", enqueue);
  return tempId;
}

/** True when a temp id is already mapped to a real id, or still has a pending/
 *  processing INSERT in the sync queue (i.e. it can still resolve). */
async function tempHasProducer(tempId: string): Promise<boolean> {
  const db = getDB();
  if (await db.id_map.get(tempId)) return true;
  const producer = await db.sync_queue
    .filter((q) => q.tempId === tempId)
    .first();
  return (
    !!producer &&
    (producer.status === "pending" || producer.status === "processing")
  );
}

function enqueueGoalsCategoryInsert(
  tempId: string,
  icon: string,
  enqueue: EnqueueFn,
): Promise<void> {
  return enqueue({
    table: "asset_categories",
    operation: "INSERT",
    recordId: tempId,
    tempId,
    payload: { name: "Goals", icon },
  });
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
      const categoryId = await ensureGoalsAssetCategoryId(userId, enqueue);

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
      const nowIso = new Date().toISOString();
      const idbPatch: Record<string, unknown> = { updated_at: nowIso };
      const serverUpdates: Record<string, unknown> = {};
      // A goal "current amount" edit is applied via an asset_value_history
      // "update_value" entry (like addAssetEntry) — NOT via the assets UPDATE —
      // so the net-worth trend line actually gets a running_total row. The server
      // addAssetEntry("update_value") both inserts the row and syncs assets.value.
      let historyEnqueue:
        | Parameters<typeof enqueue>[0]
        | undefined;

      if (updates.name !== undefined) {
        idbPatch.name = updates.name;
        serverUpdates.name = updates.name;
      }
      if (updates.target_amount !== undefined) {
        idbPatch.target_amount = updates.target_amount;
        serverUpdates.target_amount = updates.target_amount;
      }
      if (updates.current_amount !== undefined) {
        const asset = await db.assets.get(id);
        if (asset) {
          const newValue = Number(updates.current_amount);
          idbPatch.value = newValue;
          const histId = `temp_${crypto.randomUUID()}`;
          const entryDate = nowIso.split("T")[0];
          // Optimistic history row so the trend reflects the change immediately.
          await db.asset_value_history.add({
            id: histId,
            asset_id: id,
            user_id: asset.user_id,
            entry_type: "update_value",
            amount: newValue,
            running_total: newValue,
            note: null,
            entry_date: entryDate,
            created_at: nowIso,
          });
          historyEnqueue = {
            table: "asset_value_history",
            operation: "INSERT",
            recordId: histId,
            tempId: histId,
            payload: {
              assetId: id,
              entryType: "update_value",
              amount: newValue,
              note: null,
              entryDate,
            },
          };
        }
      }

      if (updates.color !== undefined) {
        idbPatch.color = updates.color;
        serverUpdates.color = updates.color;
      }

      await db.assets.update(id, idbPatch);

      // Only enqueue an assets UPDATE if a non-value field changed — the value
      // change rides on the history INSERT above (avoids a redundant/no-op op).
      if (Object.keys(serverUpdates).length > 0) {
        await enqueue({
          table: "assets",
          operation: "UPDATE",
          recordId: id,
          payload: { id, updates: serverUpdates },
        });
      }
      if (historyEnqueue) await enqueue(historyEnqueue);
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
      // Goal icon renders on the Dashboard too — keep it in sync with siblings.
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
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
