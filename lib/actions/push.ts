"use server";

import { createClient } from "@/lib/supabase/server";
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

type RawSupabase = {
  from: (t: "push_subscriptions") => {
    upsert: (
      vals: Record<string, unknown>,
      opts?: { onConflict?: string },
    ) => Promise<{ error: { message: string } | null }>;
    delete: () => {
      eq: (k: string, v: string) => {
        eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
};

async function getAuthed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const raw = supabase as unknown as RawSupabase;

  const { error } = await raw.from("push_subscriptions").upsert(
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
  const raw = supabase as unknown as RawSupabase;

  const { error } = await raw
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
    body: "Test notification — push is working.",
    tag: "test",
    url: "/dashboard",
  });
  return { ok: true };
}
