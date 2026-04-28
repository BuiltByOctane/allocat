"use server";

import { createClient } from "@/lib/supabase/server";
import { upsertTodaySnapshot } from "./asset-history";
import { computeMonthlyHistory } from "@/lib/utils/netWorthHistory";
import { logActivity, fmt } from "@/lib/server/activity-logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeAsset(raw: any) {
  const cat = raw.asset_categories;
  return {
    id: raw.id as string,
    user_id: raw.user_id as string,
    name: raw.name as string,
    icon: raw.icon as string | null,
    category_id: raw.category_id as string | null,
    category_name: (cat?.name ?? raw.category ?? "Other") as string,
    category_icon: (cat?.icon ?? "📦") as string,
    value: Number(raw.value),
    invested_amount: Number(raw.invested_amount ?? raw.value),
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
  };
}

export async function getNetWorthData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: assets, error } = await supabase
    .from("assets")
    .select("*, asset_categories(id, name, icon)")
    .eq("user_id", user.id)
    .order("created_at");

  if (error) throw new Error(error.message);

  const { data: debts } = await supabase
    .from("debts")
    .select("principal, total_paid, type, is_closed")
    .eq("user_id", user.id);

  const totalLiabilities = (debts || [])
    .filter(d => !d.is_closed && d.type !== "lent")
    .reduce((sum, d) => sum + (Number(d.principal) - Number(d.total_paid)), 0);

  const { data: rawHistory } = await supabase
    .from("asset_value_history")
    .select("asset_id, running_total, entry_date, created_at")
    .eq("user_id", user.id)
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });

  const netWorthHistory = computeMonthlyHistory(rawHistory ?? [], totalLiabilities, 12);

  return {
    assets: (assets || []).map(normalizeAsset),
    totalLiabilities,
    netWorthHistory,
  };
}

export async function addAsset(
  name: string,
  categoryId: string | null,
  value: number,
  icon?: string | null
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("assets")
    .insert({
      user_id: user.id,
      name,
      category_id: categoryId,
      category: "other",
      value,
      invested_amount: value,
      icon: icon ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Record initial history entry
  await supabase.from("asset_value_history").insert({
    asset_id: data.id,
    user_id: user.id,
    entry_type: "initial",
    amount: value,
    running_total: value,
    entry_date: new Date().toISOString().split("T")[0],
  });

  await upsertTodaySnapshot();

  await logActivity(supabase, user.id, {
    action_type: "asset_added",
    category: "net_worth",
    title: `Added asset "${name}"`,
    description: `New asset "${name}" added with initial value ${fmt(value)}`,
    metadata: { assetId: data.id, name, value, categoryId },
  });

  return data;
}

export async function updateAsset(id: string, updates: { name?: string; value?: number; icon?: string; category_id?: string | null }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("assets")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  const assetName = data.name;
  let title: string;
  if (updates.name !== undefined) {
    title = `Renamed asset to "${updates.name}"`;
  } else if (updates.value !== undefined) {
    title = `Updated "${assetName}" value to ${fmt(updates.value)}`;
  } else {
    title = `Updated asset "${assetName}"`;
  }

  await logActivity(supabase, user.id, {
    action_type: "asset_updated",
    category: "net_worth",
    title,
    description: title,
    metadata: {
      assetId: id,
      name: assetName,
      ...(updates.value !== undefined ? { amount: updates.value } : {}),
    },
  });

  return data;
}

export async function updateAssetIcon(id: string, icon: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("assets")
    .update({ icon, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteAsset(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: asset } = await supabase
    .from("assets")
    .select("name, value")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase
    .from("assets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  await upsertTodaySnapshot();

  await logActivity(supabase, user.id, {
    action_type: "asset_deleted",
    category: "net_worth",
    title: `Deleted asset "${asset?.name ?? id}"`,
    description: `Asset "${asset?.name ?? id}" was removed`,
    metadata: { assetId: id, name: asset?.name ?? null, lastValue: asset?.value ?? null },
  });

  return true;
}
