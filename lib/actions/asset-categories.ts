"use server";

import { createClient, getAuthedUser } from "@/lib/supabase/server";

export async function getAssetCategories() {
  const supabase = await createClient();
  const user = await getAuthedUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("asset_categories")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at");

  if (error) throw new Error(error.message);
  return data || [];
}

export async function addAssetCategory(name: string, icon: string) {
  const supabase = await createClient();
  const user = await getAuthedUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("asset_categories")
    .insert({ user_id: user.id, name, icon })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateAssetCategory(id: string, updates: { name?: string; icon?: string }) {
  const supabase = await createClient();
  const user = await getAuthedUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("asset_categories")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteAssetCategory(id: string) {
  const supabase = await createClient();
  const user = await getAuthedUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("asset_categories")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  return true;
}

export async function seedDefaultCategories() {
  const supabase = await createClient();
  const user = await getAuthedUser();
  if (!user) throw new Error("Unauthorized");

  const { count } = await supabase
    .from("asset_categories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (count && count > 0) return;

  const defaults = [
    { name: "Cash", icon: "💵" },
    { name: "Investments", icon: "📈" },
    { name: "Real Estate", icon: "🏠" },
    { name: "Gold", icon: "🥇" },
    { name: "Vehicle", icon: "🚗" },
    { name: "Other", icon: "📦" },
  ];

  await supabase
    .from("asset_categories")
    .insert(defaults.map((d) => ({ ...d, user_id: user.id })));
}
