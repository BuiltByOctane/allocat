import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { addAssetEntry, getAssetHistory } from "@/lib/actions/asset-history";
import { getDB } from "@/lib/db";
import { useEnqueue } from "@/lib/hooks/useSync";
import { NET_WORTH_KEY } from "./useNetWorth";
import { DASHBOARD_KEY } from "./useDashboard";

type EntryType = "initial" | "add_funds" | "withdraw" | "update_value";

export function assetHistoryKey(assetId: string) {
  return ["asset-history", assetId] as const;
}

async function getHistoryFromIDB(assetId: string, limit: number) {
  const db = getDB();
  const entries = await db.asset_value_history
    .where("asset_id")
    .equals(assetId)
    .toArray();
  entries.sort((a, b) => {
    const dateDiff = b.entry_date.localeCompare(a.entry_date);
    return dateDiff !== 0 ? dateDiff : b.created_at.localeCompare(a.created_at);
  });
  return entries.slice(0, limit);
}

export function useAssetHistory(assetId: string | null, limit = 10) {
  return useQuery({
    queryKey: assetHistoryKey(assetId ?? ""),
    enabled: !!assetId,
    queryFn: async () => {
      const local = await getHistoryFromIDB(assetId!, limit);
      if (local.length > 0) return local;
      return getAssetHistory(assetId!, limit);
    },
  });
}

export function useAddAssetEntry() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      assetId,
      entryType,
      amount,
      note,
      entryDate,
    }: {
      assetId: string;
      entryType: EntryType;
      amount: number;
      note?: string | null;
      entryDate?: string;
    }) => {
      const db = getDB();
      const today = entryDate ?? new Date().toISOString().split("T")[0];
      const now = new Date().toISOString();

      // Compute running_total from current asset value in IDB
      const asset = await db.assets.get(assetId);
      const currentValue = asset ? Number(asset.value) : 0;
      const currentInvested = asset ? Number(asset.invested_amount ?? asset.value) : 0;

      let runningTotal: number;
      let newInvestedAmount: number | undefined;
      switch (entryType) {
        case "add_funds":
          runningTotal = currentValue + amount;
          newInvestedAmount = currentInvested + amount;
          break;
        case "withdraw":
          runningTotal = Math.max(0, currentValue - amount);
          newInvestedAmount = Math.max(0, currentInvested - amount);
          break;
        case "update_value":
        case "initial":
          runningTotal = amount;
          break;
      }

      const tempId = `temp_${crypto.randomUUID()}`;

      await db.asset_value_history.add({
        id: tempId,
        asset_id: assetId,
        user_id: "__pending__",
        entry_type: entryType,
        amount,
        running_total: runningTotal,
        note: note ?? null,
        entry_date: today,
        created_at: now,
      });

      // Update denormalized asset value (and invested_amount) in IDB
      await db.assets.update(assetId, {
        value: runningTotal,
        ...(newInvestedAmount !== undefined ? { invested_amount: newInvestedAmount } : {}),
        updated_at: now,
      });

      await enqueue({
        table: "asset_value_history",
        operation: "INSERT",
        recordId: tempId,
        tempId,
        payload: { assetId, entryType, amount, note: note ?? null, entryDate: today },
      });

      return { id: tempId, runningTotal };
    },
    onSuccess: async (_, vars) => {
      await qc.refetchQueries({ queryKey: NET_WORTH_KEY, type: "all" });
      await qc.refetchQueries({ queryKey: ["goals"], type: "all" });
      await qc.refetchQueries({ queryKey: DASHBOARD_KEY, type: "all" });
      await qc.refetchQueries({ queryKey: assetHistoryKey(vars.assetId), type: "all" });
    },
  });
}

// Compute monthly growth from IDB asset_value_history
export async function computeMonthlyGrowth(currentTotal: number): Promise<{ amount: number; percent: number } | null> {
  const db = getDB();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = thirtyDaysAgo.toISOString().split("T")[0];

  // Get all assets
  const assets = await db.assets.toArray();
  if (assets.length === 0) return null;

  let previousTotal = 0;
  for (const asset of assets) {
    // Find the most recent entry for this asset on or before 30 days ago
    const entries = await db.asset_value_history
      .where("asset_id")
      .equals(asset.id)
      .filter((e) => e.entry_date <= cutoffDate)
      .toArray();

    if (entries.length > 0) {
      entries.sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at));
      previousTotal += Number(entries[0].running_total);
    }
    // If no entry before cutoff, this asset didn't exist 30 days ago — contributes 0 to previous
  }

  if (previousTotal === 0) return null;

  const amount = currentTotal - previousTotal;
  const percent = Math.round(((amount) / previousTotal) * 100 * 10) / 10;
  return { amount, percent };
}
