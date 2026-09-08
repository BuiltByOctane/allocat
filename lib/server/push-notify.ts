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

/**
 * Outcome of a send. Callers in product code ignore it, but anything that
 * reports back to a human (the admin portal) must not treat "didn't throw" as
 * "delivered" — every failure path here is deliberately silent so a missing
 * VAPID key or a stale subscription can't break a budget save.
 */
export interface PushResult {
  /** Subscriptions found for the user. 0 means the user has no push-capable device registered. */
  subscriptions: number;
  sent: number;
  failed: number;
  /** Why nothing was attempted, when nothing was. */
  skipped?: "vapid_unconfigured" | "service_unavailable" | "query_failed" | "no_subscriptions";
}

export async function notifyUser(
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  const none = (skipped: PushResult["skipped"]): PushResult => ({
    subscriptions: 0,
    sent: 0,
    failed: 0,
    skipped,
  });

  if (!ensureConfigured()) {
    console.warn("[push-notify] VAPID env not set; skipping push.");
    return none("vapid_unconfigured");
  }

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (err) {
    console.warn("[push-notify] service client unavailable:", err);
    return none("service_unavailable");
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    console.warn("[push-notify] fetch subs failed:", error.message);
    return none("query_failed");
  }
  if (!subs?.length) return none("no_subscriptions");

  const body = JSON.stringify(payload);
  const stale: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent += 1;
        await supabase
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", s.id);
      } catch (err) {
        failed += 1;
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

  return { subscriptions: subs.length, sent, failed };
}
