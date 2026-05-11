"use server";

import { createClient } from "@/lib/supabase/server";
import { upsertTodaySnapshot } from "./asset-history";
import { computeMonthlyHistory } from "@/lib/utils/netWorthHistory";
import { logActivity, fmt } from "@/lib/server/activity-logger";
import { notifyUser } from "@/lib/server/push-notify";

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
    is_goal: Boolean(raw.is_goal),
    target_amount: raw.target_amount != null ? Number(raw.target_amount) : null,
    achieved_at: (raw.achieved_at ?? null) as string | null,
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
  };
}

export async function getNetWorthData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Net worth list excludes achieved goal-assets (kept for archive only).
  const { data: assets, error } = await supabase
    .from("assets")
    .select("*, asset_categories(id, name, icon)")
    .eq("user_id", user.id)
    .is("achieved_at", null)
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
  icon?: string | null,
  options?: { isGoal?: boolean; targetAmount?: number | null }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const isGoal = Boolean(options?.isGoal);
  const targetAmount = isGoal && options?.targetAmount != null ? Number(options.targetAmount) : null;

  // If creating a goal-asset and no category given, slot it under user's "Goals" category
  let resolvedCategoryId = categoryId;
  if (isGoal && !resolvedCategoryId) {
    const { data: goalsCat } = await supabase
      .from("asset_categories")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", "Goals")
      .maybeSingle();
    if (goalsCat) {
      resolvedCategoryId = goalsCat.id;
    } else {
      const { data: created } = await supabase
        .from("asset_categories")
        .insert({ user_id: user.id, name: "Goals", icon: "🎯" })
        .select("id")
        .single();
      resolvedCategoryId = created?.id ?? null;
    }
  }

  const { data, error } = await supabase
    .from("assets")
    .insert({
      user_id: user.id,
      name,
      category_id: resolvedCategoryId,
      category: "other",
      value,
      invested_amount: value,
      icon: icon ?? null,
      is_goal: isGoal,
      target_amount: targetAmount,
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
    action_type: isGoal ? "goal_asset_added" : "asset_added",
    category: "net_worth",
    title: isGoal ? `Added goal "${name}"` : `Added asset "${name}"`,
    description: isGoal
      ? `New goal "${name}" added${targetAmount != null ? ` with target ${fmt(targetAmount)}` : ""}`
      : `New asset "${name}" added with initial value ${fmt(value)}`,
    metadata: { assetId: data.id, name, value, categoryId: resolvedCategoryId, isGoal, targetAmount },
  });

  return data;
}

export async function updateAsset(
  id: string,
  updates: {
    name?: string;
    value?: number;
    icon?: string;
    category_id?: string | null;
    is_goal?: boolean;
    target_amount?: number | null;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Toggling is_goal off clears goal-only fields
  const finalUpdates: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  };
  if (updates.is_goal === false) {
    finalUpdates.target_amount = null;
    finalUpdates.achieved_at = null;
  }

  const { data, error } = await supabase
    .from("assets")
    .update(finalUpdates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  const assetName = data.name;
  let title: string;
  let action_type = "asset_updated";
  if (updates.is_goal === true) {
    title = `Marked "${assetName}" as a goal`;
    action_type = "goal_asset_toggled_on";
  } else if (updates.is_goal === false) {
    title = `Removed goal target from "${assetName}"`;
    action_type = "goal_asset_toggled_off";
  } else if (updates.target_amount !== undefined) {
    title = `Set target for "${assetName}" to ${fmt(Number(updates.target_amount ?? 0))}`;
    action_type = "goal_target_updated";
  } else if (updates.name !== undefined) {
    title = `Renamed asset to "${updates.name}"`;
  } else if (updates.value !== undefined) {
    title = `Updated "${assetName}" value to ${fmt(updates.value)}`;
  } else {
    title = `Updated asset "${assetName}"`;
  }

  await logActivity(supabase, user.id, {
    action_type,
    category: "net_worth",
    title,
    description: title,
    metadata: {
      assetId: id,
      name: assetName,
      ...(updates.value !== undefined ? { amount: updates.value } : {}),
      ...(updates.target_amount !== undefined ? { target_amount: updates.target_amount } : {}),
      ...(updates.is_goal !== undefined ? { is_goal: updates.is_goal } : {}),
    },
  });

  return data;
}

/**
 * Mark a goal-asset as achieved/withdrawn:
 * - Records a `withdraw` history entry for the previous value.
 * - Zeroes value + invested_amount.
 * - Stamps `achieved_at`.
 * - Sweeps any budget_items linked to this asset (clears link).
 */
export async function achieveGoalAsset(assetId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: asset, error: fetchErr } = await supabase
    .from("assets")
    .select("id, name, value, is_goal, achieved_at")
    .eq("id", assetId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!asset) throw new Error("Asset not found");
  if (!asset.is_goal) throw new Error("Asset is not a goal");
  if (asset.achieved_at) throw new Error("Goal already achieved");

  const previousValue = Number(asset.value);
  const today = new Date().toISOString().split("T")[0];
  const nowIso = new Date().toISOString();

  if (previousValue > 0) {
    await supabase.from("asset_value_history").insert({
      asset_id: assetId,
      user_id: user.id,
      entry_type: "withdraw",
      amount: previousValue,
      running_total: 0,
      note: "Goal achieved",
      entry_date: today,
    });
  }

  const { data: updated, error: updErr } = await supabase
    .from("assets")
    .update({
      value: 0,
      invested_amount: 0,
      achieved_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", assetId)
    .eq("user_id", user.id)
    .select()
    .single();
  if (updErr) throw new Error(updErr.message);

  // Sweep budget_items linked to this asset
  await supabase
    .from("budget_items")
    .update({ link_type: null, link_id: null })
    .eq("user_id", user.id)
    .eq("link_type", "asset")
    .eq("link_id", assetId);

  await upsertTodaySnapshot();

  await logActivity(supabase, user.id, {
    action_type: "goal_asset_achieved",
    category: "net_worth",
    title: `Achieved goal "${asset.name}"`,
    description: `Goal "${asset.name}" marked as achieved (${fmt(previousValue)} withdrawn)`,
    metadata: { assetId, name: asset.name, withdrawnAmount: previousValue },
  });

  notifyUser(user.id, {
    title: "Goal achieved",
    body: `${asset.name} — ${fmt(previousValue)} unlocked.`,
    tag: `goal-${assetId}`,
    url: "/goals",
  }).catch(() => {});

  return updated;
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
