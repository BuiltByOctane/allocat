"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isKnownAvatar } from "@/lib/profile/avatars";

export async function markUserAsOnboarded() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_onboarded: true })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to mark user as onboarded:", error.message);
    return { error: error.message };
  }

  // Revalidate layout to pick up profile changes if needed
  revalidatePath("/", "layout");

  return { success: true };
}

export async function updateUserCurrency(code: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ currency: code })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to update currency:", error.message);
    return { error: error.message };
  }

  return { success: true };
}

export async function updateUserAvatar(avatarId: string) {
  if (!isKnownAvatar(avatarId)) {
    return { error: `Unknown avatar: ${avatarId}` };
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ avatar: avatarId })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to update avatar:", error.message);
    return { error: error.message };
  }

  return { success: true };
}
