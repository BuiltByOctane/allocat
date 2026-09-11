"use server";

import { createClient, getAuthedUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isKnownAvatar } from "@/lib/profile/avatars";

type DbClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Record that `userId` was active today (UTC).
 *
 * One row per (user, day) — `profiles.last_seen_at` is overwritten and so can
 * never answer "how many people were active on day X". Idempotent: the primary
 * key absorbs repeat calls.
 */
async function recordActiveDay(supabase: DbClient, userId: string) {
  const { error } = await supabase
    .from("user_active_days")
    .upsert(
      { user_id: userId, day: new Date().toISOString().slice(0, 10) },
      { onConflict: "user_id,day", ignoreDuplicates: true },
    );
  if (error) console.warn("Failed to record active day:", error.message);
}

export async function markUserAsOnboarded() {
  const supabase = await createClient();

  const user = await getAuthedUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_onboarded: true, last_seen_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to mark user as onboarded:", error.message);
    return { error: error.message };
  }

  // A person who signs up today IS active today. Onboarding lives outside
  // app/(app)/*, so SyncProvider — the only other place this is recorded —
  // never mounts during signup; without this a new account shows as inactive
  // until its owner returns the following day.
  await recordActiveDay(supabase, user.id);

  // Revalidate layout to pick up profile changes if needed
  revalidatePath("/", "layout");

  return { success: true };
}

export async function updateUserCurrency(code: string) {
  const supabase = await createClient();

  const user = await getAuthedUser();
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

  const user = await getAuthedUser();
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

/**
 * Stamp `profiles.last_seen_at` and `last_app_mode`.
 *
 * The admin portal's DAU/WAU numbers need a signal for users who only *read*
 * their budget — `activity_logs` records mutations only, so a daily reader
 * looks inactive there. Callers throttle to at most once per UTC day (see
 * SyncProvider), so this is one extra write per user per day.
 *
 * `mode` rides along because this is the only place the server hears from a
 * client that knows whether it is the native shell. The login/OAuth paths
 * cannot tell: since Android became a Capacitor WebView of this same app, both
 * platforms hit the identical server action, so only the client's own
 * `Capacitor.isNativePlatform()` distinguishes them.
 */
export async function touchLastSeen(mode?: "web" | "android") {
  const supabase = await createClient();

  const user = await getAuthedUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      last_seen_at: new Date().toISOString(),
      ...(mode ? { last_app_mode: mode } : {}),
    })
    .eq("id", user.id);

  await recordActiveDay(supabase, user.id);

  if (error) {
    console.warn("Failed to stamp last_seen_at:", error.message);
    return { error: error.message };
  }

  return { success: true };
}
