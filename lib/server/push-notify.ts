import "server-only";
import webpush, { WebPushError } from "web-push";
import { createServiceClient } from "@/lib/supabase/service";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export async function notifyUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureConfigured()) {
    console.warn("[push-notify] VAPID env not set; skipping push.");
    return;
  }

  let client;
  try {
    client = createServiceClient();
  } catch (err) {
    console.warn("[push-notify] service client unavailable:", err);
    return;
  }
  const supabase = client as unknown as {
    from: (
      t: "push_subscriptions",
    ) => {
      select: (cols: string) => {
        eq: (
          k: string,
          v: string,
        ) => Promise<{
          data: Array<{ id: string; endpoint: string; p256dh: string; auth: string }> | null;
          error: { message: string } | null;
        }>;
      };
      update: (vals: Record<string, unknown>) => {
        eq: (k: string, v: string) => Promise<{ error: unknown }>;
      };
      delete: () => {
        in: (k: string, v: string[]) => Promise<{ error: unknown }>;
      };
    };
  };

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    console.warn("[push-notify] fetch subs failed:", error.message);
    return;
  }
  if (!subs?.length) return;

  const body = JSON.stringify(payload);
  const stale: string[] = [];

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        await supabase
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", s.id);
      } catch (err) {
        const status = err instanceof WebPushError ? err.statusCode : 0;
        if (status === 404 || status === 410) {
          stale.push(s.endpoint);
        } else {
          console.warn("[push-notify] send failed:", status, err);
        }
      }
    }),
  );

  if (stale.length) {
    await supabase.from("push_subscriptions").delete().in("endpoint", stale);
  }
}
