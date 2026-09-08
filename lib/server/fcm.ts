import "server-only";
import { createSign } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Firebase Cloud Messaging (HTTP v1) sender.
 *
 * The Android app is a Capacitor WebView, which has no Web Push API — so the
 * VAPID/web-push path in push-notify.ts cannot reach it. FCM is the only way a
 * server-side notification lands on the installed app.
 *
 * Auth is a self-signed JWT swapped for an OAuth token, the same handshake
 * lib/play/installs.ts does for Cloud Storage (different scope). No
 * google-auth-library dependency: it is ~40 lines against a documented, stable
 * endpoint, and this app already needed the primitive.
 *
 * Note v1 has no multicast — `messages:send` takes exactly one token, so a
 * broadcast is N requests. They are chunked rather than fired all at once.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const SEND_CHUNK = 50;

export interface FcmPayload {
  title: string;
  body: string;
  /** In-app path opened when the notification is tapped. */
  url?: string;
  /** Collapse key — a newer message with the same tag replaces the older one. */
  tag?: string;
}

function loadServiceAccount() {
  const b64 = process.env.FCM_SA_JSON_B64;
  if (!b64) throw new Error("FCM_SA_JSON_B64 is not set.");
  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    throw new Error("FCM_SA_JSON_B64 is not valid base64-encoded JSON.");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Firebase service-account JSON is missing client_email / private_key.");
  }
  return { clientEmail: parsed.client_email, privateKey: parsed.private_key };
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Tokens are valid an hour; caching one avoids a handshake per recipient.
let cached: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const sa = loadServiceAccount();
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({ iss: sa.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  // The JSON key may store the PEM with literal "\n" sequences.
  const signature = b64url(signer.sign(sa.privateKey.replace(/\\n/g, "\n")));

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  if (!res.ok) {
    throw new Error(`FCM token exchange failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("FCM token response had no access_token.");

  cached = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

export function isFcmConfigured(): boolean {
  return Boolean(process.env.FCM_SA_JSON_B64 && process.env.FCM_PROJECT_ID);
}

/** `dead` means FCM said this token will never work again — the caller prunes it. */
type SendOutcome = { ok: true } | { ok: false; dead: boolean; reason: string };

async function sendOne(
  accessToken: string,
  projectId: string,
  token: string,
  payload: FcmPayload,
): Promise<SendOutcome> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        // Read by the tap handler in components/pwa/PushRegistration.tsx.
        // Lets the native shell put this remote notification into the app's
        // device-local notification inbox. FCM data values must be strings.
        data: { ...(payload.url ? { url: payload.url } : {}), inbox: "broadcast" },
        android: {
          priority: "HIGH",
          collapse_key: payload.tag,
          notification: {
            // Matches the LocalNotifications config in capacitor.config.ts, so
            // pushes and on-device alerts look identical in the shade.
            icon: "ic_notification",
            color: "#F4A340",
            channel_id: "allocat-broadcast-v2",
            tag: payload.tag,
            click_action: "FCM_PLUGIN_ACTIVITY",
          },
        },
      },
    }),
  });

  if (res.ok) return { ok: true };

  const text = await res.text();
  // Prune ONLY when FCM is talking about the registration token itself.
  //
  // A malformed payload also comes back 400 INVALID_ARGUMENT, so treating every
  // 400 as "dead token" would silently wipe the whole table the first time we
  // ship a bad message body — a self-inflicted outage that looks like everyone
  // uninstalling. 404/UNREGISTERED is the unambiguous "app is gone" signal.
  const dead =
    res.status === 404 ||
    /UNREGISTERED/.test(text) ||
    /not a valid FCM registration token|registration token is not valid/i.test(text);
  return { ok: false, dead, reason: `${res.status} ${text.slice(0, 200)}` };
}

export interface FcmResult {
  tokens: number;
  sent: number;
  failed: number;
  pruned: number;
}

/**
 * Send to an explicit list of tokens, pruning any FCM reports as permanently
 * dead. Returns counts rather than throwing on partial failure — with a fan-out
 * some failures are normal and must not abort the rest.
 */
export async function sendToTokens(tokens: string[], payload: FcmPayload): Promise<FcmResult> {
  const projectId = process.env.FCM_PROJECT_ID;
  if (!projectId) throw new Error("FCM_PROJECT_ID is not set.");
  if (tokens.length === 0) return { tokens: 0, sent: 0, failed: 0, pruned: 0 };

  const accessToken = await getAccessToken();
  const service = createServiceClient();

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];

  for (let i = 0; i < tokens.length; i += SEND_CHUNK) {
    await Promise.allSettled(
      tokens.slice(i, i + SEND_CHUNK).map(async (t) => {
        try {
          const out = await sendOne(accessToken, projectId, t, payload);
          if (out.ok) {
            sent += 1;
            return;
          }
          failed += 1;
          if (out.dead) dead.push(t);
          else console.warn("[fcm] send failed:", out.reason);
        } catch (err) {
          failed += 1;
          console.warn("[fcm] send threw:", err);
        }
      }),
    );
  }

  if (dead.length) {
    for (let i = 0; i < dead.length; i += 150) {
      await service.from("fcm_tokens").delete().in("token", dead.slice(i, i + 150));
    }
  }

  if (sent > 0) {
    // Best effort; a failed timestamp update must not fail the send. Chunked —
    // slicing to the first 150 would leave every later token looking stale.
    const deadSet = new Set(dead);
    const live = tokens.filter((t) => !deadSet.has(t));
    const stamp = new Date().toISOString();
    for (let i = 0; i < live.length; i += 150) {
      const { error } = await service
        .from("fcm_tokens")
        .update({ last_used_at: stamp })
        .in("token", live.slice(i, i + 150));
      if (error) {
        console.warn("[fcm] last_used_at update failed:", error.message);
        break;
      }
    }
  }

  return { tokens: tokens.length, sent, failed, pruned: dead.length };
}

/** Every FCM token belonging to one user. */
export async function tokensForUser(userId: string): Promise<string[]> {
  const service = createServiceClient();
  const { data, error } = await service.from("fcm_tokens").select("token").eq("user_id", userId);
  if (error) {
    console.warn("[fcm] token lookup failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.token);
}
