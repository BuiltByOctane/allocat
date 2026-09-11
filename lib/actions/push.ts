"use server";

import { createClient, getAuthedUser } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logActivity } from "@/lib/server/activity-logger";
import { notifyUser } from "@/lib/server/push-notify";

interface PushKeys {
  p256dh: string;
  auth: string;
}

interface PushSubscriptionInput {
  endpoint: string;
  keys: PushKeys;
}

async function getAuthed() {
  const supabase = await createClient();
  const user = await getAuthedUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}

export async function subscribePush(
  sub: PushSubscriptionInput,
  userAgent?: string,
) {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error("Invalid push subscription");
  }

  const { supabase, user } = await getAuthed();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent ?? null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, {
    action_type: "push_subscribed",
    category: "budget",
    title: "Push notifications enabled",
    description: "This device will now receive AlloCat alerts.",
  });

  return { ok: true };
}

export async function unsubscribePush(endpoint: string) {
  if (!endpoint) throw new Error("Missing endpoint");
  const { supabase, user } = await getAuthed();

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function sendTestPush() {
  const { user } = await getAuthed();
  await notifyUser(user.id, {
    title: "AlloCat",
    body: "Test notification: push is working.",
    tag: "test",
    url: "/dashboard",
  });
  return { ok: true };
}

/* ── FCM (native Android) ────────────────────────────────────────────────────
 * Web Push and FCM are separate transports: the Capacitor WebView has no Web
 * Push API, so the native app registers an FCM token here instead of a
 * push_subscriptions row. See lib/server/fcm.ts.
 * ───────────────────────────────────────────────────────────────────────────*/

export async function registerFcmToken(token: string, appVersion?: string) {
  if (!token || token.length > 500) throw new Error("Invalid FCM token");
  const { user } = await getAuthed();

  // Service client, not the caller's: keyed on the token, so when a device that
  // was signed into a DIFFERENT account re-registers, the row must be reassigned
  // to the current user. The row-owner RLS policy would reject that update,
  // leaving the old account still receiving this device's pushes. The user is
  // already authenticated above and user_id is taken from the session, never
  // from the request, so this cannot be used to write someone else's row.
  const { error } = await createServiceClient().from("fcm_tokens").upsert(
    {
      token,
      user_id: user.id,
      platform: "android",
      app_version: appVersion ?? null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );

  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Called on sign-out so a shared device stops receiving the old account's pushes. */
export async function unregisterFcmToken(token: string) {
  if (!token) return { ok: true };
  const { user } = await getAuthed();
  const { error } = await createServiceClient()
    .from("fcm_tokens")
    .delete()
    .eq("token", token)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}
