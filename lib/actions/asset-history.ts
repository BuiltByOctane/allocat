"use server";

import { createClient } from "@/lib/supabase/server";
import { logActivity, fmt, getUserCurrency } from "@/lib/server/activity-logger";

type EntryType = "initial" | "add_funds" | "withdraw" | "update_value";

export async function addAssetEntry(
  assetId: string,
  entryType: EntryType,
  amount: number,
  note?: string | null,
  entryDate?: string,
  options?: { suppressLog?: boolean }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Get current asset value and name
  const { data: asset, error: assetErr } = await supabase
    .from("assets")
    .select("value, name, invested_amount")
    .eq("id", assetId)
    .eq("user_id", user.id)
    .single();

  if (assetErr || !asset) throw new Error("Asset not found");

  const currentValue = Number(asset.value);
  const currentInvested = Number(asset.invested_amount ?? currentValue);
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
    default:
      throw new Error("Invalid entry type");
  }

  const today = entryDate ?? new Date().toISOString().split("T")[0];

  const { data: entry, error: histErr } = await supabase
    .from("asset_value_history")
    .insert({
      asset_id: assetId,
      user_id: user.id,
      entry_type: entryType,
      amount,
      running_total: runningTotal,
      note: note ?? null,
      entry_date: today,
    })
    .select()
    .single();

  if (histErr) throw new Error(histErr.message);

  // Keep assets.value (and invested_amount) in sync as denormalized cache
  await supabase
    .from("assets")
    .update({
      value: runningTotal,
      ...(newInvestedAmount !== undefined ? { invested_amount: newInvestedAmount } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", assetId)
    .eq("user_id", user.id);

  await upsertTodaySnapshot();

  // Log activity for user-initiated entries (not initial, not suppressed by cascade caller)
  if (entryType !== "initial" && !options?.suppressLog) {
    const cur = await getUserCurrency(supabase, user.id);
    const actionMap: Record<string, string> = {
      add_funds: "asset_funds_added",
      withdraw: "asset_funds_withdrawn",
      update_value: "asset_value_updated",
    };
    const titleMap: Record<string, string> = {
      add_funds: `Added ${fmt(amount, cur)} to "${asset.name}"`,
      withdraw: `Withdrew ${fmt(amount, cur)} from "${asset.name}"`,
      update_value: `Updated "${asset.name}" value to ${fmt(runningTotal, cur)}`,
    };
    await logActivity(supabase, user.id, {
      action_type: actionMap[entryType],
      category: "net_worth",
      title: titleMap[entryType],
      description: titleMap[entryType],
      metadata: {
        assetId,
        assetName: asset.name,
        amount,
        currency: cur,
        newBalance: runningTotal,
        ...(note ? { note } : {}),
      },
    });
  }

  return entry;
}

export async function getAssetHistory(assetId: string, limit = 10) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("asset_value_history")
    .select("*")
    .eq("asset_id", assetId)
    .eq("user_id", user.id)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function upsertTodaySnapshot() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const today = new Date().toISOString().split("T")[0];

  const { data: assets } = await supabase
    .from("assets")
    .select("value")
    .eq("user_id", user.id)
    .is("achieved_at", null);

  const { data: debts } = await supabase
    .from("debts")
    .select("principal, total_paid, type, is_closed")
    .eq("user_id", user.id);

  const totalAssets = (assets || []).reduce((s, a) => s + Number(a.value), 0);
  const totalLiabilities = (debts || [])
    .filter((d) => !d.is_closed && d.type !== "lent")
    .reduce((s, d) => s + (Number(d.principal) - Number(d.total_paid)), 0);

  await supabase
    .from("net_worth_snapshots")
    .upsert(
      {
        user_id: user.id,
        snapshot_date: today,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        net_worth: totalAssets - totalLiabilities,
      },
      { onConflict: "user_id,snapshot_date" }
    );
}
