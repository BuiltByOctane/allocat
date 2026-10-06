"use client";

import { subscribePush } from "@/lib/actions/push";
import { urlBase64ToUint8Array } from "@/lib/utils/urlBase64";

/**
 * Web Push on this browser. On iPhone it only exists for a Home Screen web app
 * (iOS 16.4+, HTTPS) — Safari tabs have no PushManager at all.
 *
 * - "unsupported": no Push API here (iPhone Safari tab, http, old iOS)
 * - "denied":      the user blocked notifications; only Settings can undo it
 * - "off":         supported, not yet enabled
 * - "on":          permission granted and this device is subscribed
 */
export type WebPushState = "unsupported" | "denied" | "off" | "on";

/**
 * `serviceWorker.ready` never settles when no worker is registered (dev builds
 * skip registration), which would hang the caller forever.
 */
function swReady(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

export async function getWebPushState(): Promise<WebPushState> {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  try {
    const reg = await swReady();
    if (!reg) return "unsupported";
    return (await reg.pushManager.getSubscription()) ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Ask permission, subscribe this device and register it with the server. */
export async function enableWebPush(): Promise<WebPushState> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";

  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY missing");

  const reg = await swReady();
  if (!reg) throw new Error("No service worker registered");
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    }));

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Subscription missing keys");
  }
  // The stored user agent is how the shortcut endpoint knows a push reached an
  // iPhone (and so the shortcut can stay quiet).
  await subscribePush(
    { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
    navigator.userAgent,
  );
  return "on";
}
