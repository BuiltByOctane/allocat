import "server-only";
import webpush, { WebPushError } from "web-push";
import { createServiceClient } from "@/lib/supabase/service";
import type { PushPayload } from "@/lib/server/push-notify";
import { sendToTokens, isFcmConfigured } from "@/lib/server/fcm";

/**
 * Fan-out push for the admin portal.
 *
 * Kept separate from `notifyUser` in push-notify.ts on purpose: that function is
 * on the hot path of ordinary product features and should stay a single-user,
 * single-purpose call. Broadcasting has different failure semantics (partial
 * success is normal), needs paging, and must never be reachable from product
 * code by accident.
 *
 * Two transports, because no single one reaches everybody:
 *   - Web Push (VAPID)  → browsers and installed PWAs
 *   - FCM               → the Capacitor Android shell, which has no Web Push API
 * A user on both a laptop browser and the Android app is reached twice, once per
 * device, which is correct — these are devices, not people.
 *
 * `notifyUser` deliberately does NOT gain FCM. Product notifications for SMS
 * spends are already raised on-device by lib/sms/ingestClient.ts (notifyLocal)
 * while the server path calls notifyUser for the same event, so adding FCM there
 * would double-notify every native user. Broadcasts have no such on-device twin.
 */

export type Segment = "all" | "android" | "web" | "supporters" | "inactive_7d";

export const SEGMENTS: Array<{ id: Segment; label: string; hint: string }> = [
  { id: "all", label: "Everyone", hint: "Every subscribed device" },
  { id: "android", label: "Android", hint: "Last opened the native shell" },
  { id: "web", label: "Web / PWA", hint: "Never opened the native shell" },
  { id: "supporters", label: "Supporters", hint: "Donated via Ko-fi" },
  { id: "inactive_7d", label: "Inactive 7d", hint: "Not seen in the last week" },
];

const ID_CHUNK = 150; // keeps the PostgREST `in.(…)` URL well under any limit
const SEND_CHUNK = 50; // concurrent web-push requests in flight

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

type Service = ReturnType<typeof createServiceClient>;

/** `null` means "no user filter" — every subscription qualifies. */
async function resolveUserIds(service: Service, segment: Segment): Promise<string[] | null> {
  if (segment === "all") return null;

  let q = service.from("profiles").select("id");
  if (segment === "android") q = q.eq("last_app_mode", "android");
  // `neq` alone would drop NULLs, but a user who has never opened the native
  // shell has last_app_mode NULL — they are exactly who "web" means.
  if (segment === "web") q = q.or("last_app_mode.is.null,last_app_mode.neq.android");
  if (segment === "supporters") q = q.eq("is_supporter", true);
  if (segment === "inactive_7d") {
    // Deliberately excludes NULL last_seen_at. Before the stamp rolls out
    // everyone is NULL, and treating "unknown" as "inactive" would turn this
    // segment into an accidental send-to-everyone.
    q = q.lt("last_seen_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  }

  const { data, error } = await q;
  if (error) throw new Error(`resolveUserIds: ${error.message}`);
  return (data ?? []).map((r) => r.id);
}

interface Sub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function collectSubs(service: Service, userIds: string[] | null): Promise<Sub[]> {
  const cols = "id, endpoint, p256dh, auth";

  if (userIds === null) {
    const out: Sub[] = [];
    // Page rather than relying on PostgREST's default row cap.
    for (let from = 0; ; from += 1000) {
      const { data, error } = await service
        .from("push_subscriptions")
        .select(cols)
        .range(from, from + 999);
      if (error) throw new Error(`collectSubs: ${error.message}`);
      const rows = (data ?? []) as Sub[];
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  }

  if (userIds.length === 0) return [];

  const out: Sub[] = [];
  for (let i = 0; i < userIds.length; i += ID_CHUNK) {
    const { data, error } = await service
      .from("push_subscriptions")
      .select(cols)
      .in("user_id", userIds.slice(i, i + ID_CHUNK));
    if (error) throw new Error(`collectSubs: ${error.message}`);
    out.push(...((data ?? []) as Sub[]));
  }
  return out;
}

async function collectTokens(service: Service, userIds: string[] | null): Promise<string[]> {
  if (userIds !== null && userIds.length === 0) return [];

  const out: string[] = [];
  if (userIds === null) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await service
        .from("fcm_tokens")
        .select("token")
        .range(from, from + 999);
      if (error) throw new Error(`collectTokens: ${error.message}`);
      const rows = data ?? [];
      out.push(...rows.map((r) => r.token));
      if (rows.length < 1000) return out;
    }
  }

  for (let i = 0; i < userIds.length; i += ID_CHUNK) {
    const { data, error } = await service
      .from("fcm_tokens")
      .select("token")
      .in("user_id", userIds.slice(i, i + ID_CHUNK));
    if (error) throw new Error(`collectTokens: ${error.message}`);
    out.push(...(data ?? []).map((r) => r.token));
  }
  return out;
}

export interface Reach {
  /** Total devices — the number that actually matters before sending. */
  total: number;
  web: number;
  android: number;
}

/** How many devices a segment would actually reach — shown before sending. */
export async function countRecipients(segment: Segment): Promise<Reach> {
  const service = createServiceClient();
  const ids = await resolveUserIds(service, segment);
  const [subs, tokens] = await Promise.all([
    collectSubs(service, ids),
    isFcmConfigured() ? collectTokens(service, ids) : Promise.resolve([]),
  ]);
  return { total: subs.length + tokens.length, web: subs.length, android: tokens.length };
}

export async function broadcast(
  segment: Segment,
  payload: PushPayload,
  createdBy: string,
): Promise<{
  sent: number;
  failed: number;
  recipients: number;
  web: { sent: number; failed: number };
  android: { sent: number; failed: number; pruned: number };
}> {
  const webReady = ensureConfigured();
  const fcmReady = isFcmConfigured();
  if (!webReady && !fcmReady) {
    throw new Error("Neither VAPID nor FCM is configured — push is disabled on this deploy.");
  }

  const service = createServiceClient();
  const ids = await resolveUserIds(service, segment);
  const subs = webReady ? await collectSubs(service, ids) : [];

  const body = JSON.stringify(payload);
  const stale: string[] = [];
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < subs.length; i += SEND_CHUNK) {
    await Promise.allSettled(
      subs.slice(i, i + SEND_CHUNK).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
          sent += 1;
        } catch (err) {
          failed += 1;
          const status = err instanceof WebPushError ? err.statusCode : 0;
          // Gone / not-found means the browser dropped the subscription.
          if (status === 404 || status === 410) stale.push(s.endpoint);
        }
      }),
    );
  }

  for (let i = 0; i < stale.length; i += ID_CHUNK) {
    await service
      .from("push_subscriptions")
      .delete()
      .in("endpoint", stale.slice(i, i + ID_CHUNK));
  }

  // Native leg. Failures here must not discard the web results already sent.
  let fcm = { tokens: 0, sent: 0, failed: 0, pruned: 0 };
  if (fcmReady) {
    try {
      const tokens = await collectTokens(service, ids);
      fcm = await sendToTokens(tokens, {
        title: payload.title,
        body: payload.body,
        url: payload.url,
        tag: payload.tag,
      });
    } catch (err) {
      console.warn("[broadcast] FCM leg failed:", err);
    }
  }

  const totalSent = sent + fcm.sent;
  const totalFailed = failed + fcm.failed;

  await service.from("push_campaigns").insert({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? null,
    segment,
    sent_count: totalSent,
    failed_count: totalFailed,
    created_by: createdBy,
  });

  return {
    sent: totalSent,
    failed: totalFailed,
    recipients: subs.length + fcm.tokens,
    web: { sent, failed },
    android: { sent: fcm.sent, failed: fcm.failed, pruned: fcm.pruned },
  };
}
