"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { useRouter } from "next/navigation";
import { recordNotification } from "@/lib/notify/history";

/**
 * Registers the native Android shell with FCM.
 *
 * Native-only and deliberately separate from the web-push flow in
 * `PushPermissionPrompt`: the Capacitor WebView has no Web Push API, so a
 * `push_subscriptions` row can never exist here. This gets an FCM registration
 * token instead and stores it in `fcm_tokens`.
 *
 * The token is device-scoped and rotates, so re-registering on every launch is
 * the intended pattern — the upsert is keyed on the token itself.
 */
/** Where the device's current FCM token is cached (see clearSession.ts). */
export const FCM_TOKEN_KEY = "allocat-fcm-token";

type RemoteNotification = {
  id?: string | number;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
};

/** Store a received admin broadcast in the same local inbox as app alerts. */
async function recordBroadcast(notification: RemoteNotification): Promise<void> {
  const data = notification.data ?? {};
  if (data.inbox !== "broadcast") return;

  const title = typeof notification.title === "string"
    ? notification.title
    : typeof data["gcm.n.title"] === "string"
      ? data["gcm.n.title"]
      : "AlloCat update";
  const body = typeof notification.body === "string"
    ? notification.body
    : typeof data["gcm.n.body"] === "string"
      ? data["gcm.n.body"]
      : "";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : undefined;
  const messageId = typeof data["google.message_id"] === "string"
    ? data["google.message_id"]
    : notification.id != null
      ? String(notification.id)
      : undefined;

  await recordNotification({
    ...(messageId ? { id: `fcm:${messageId}` } : {}),
    kind: "other",
    title,
    body,
    url,
  });
}

export function PushRegistration() {
  const router = useRouter();
  // The plugin's listeners are global; registering them twice would double-fire
  // navigation on a notification tap.
  const wired = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (wired.current) return;
    wired.current = true;

    let cancelled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        // Android 13+ needs POST_NOTIFICATIONS. The permission is already
        // declared via the local-notifications plugin's manifest merge; this is
        // the runtime grant. A user who declines simply never gets a token.
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
          perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive !== "granted" || cancelled) return;

        // The channel must exist before the first push arrives, or Android O+
        // drops the message's channel_id and files it under a generic
        // "Miscellaneous" channel the user cannot tune. Id matches both the
        // manifest default and the android.notification.channel_id sent by
        // lib/server/fcm.ts.
        try {
          const { LocalNotifications } = await import("@capacitor/local-notifications");
          await LocalNotifications.createChannel({
            // Android freezes a channel's sound after its first creation. Keep
            // the version in sync with the FCM payload and manifest default so
            // existing installs receive this new, custom-sound channel.
            id: "allocat-broadcast-v2",
            name: "Announcements",
            description: "Occasional updates from AlloCat",
            importance: 4,
            visibility: 1,
            vibration: true,
            sound: "meow.mp3",
          });
        } catch {
          /* channel may already exist */
        }

        handles.push(
          await PushNotifications.addListener("registration", async (t) => {
            try {
              // Cached device-side so sign-out can delete the row without
              // re-running register() just to rediscover the token. Device-level,
              // not account-scoped: the token belongs to the handset and is
              // reassigned to whoever signs in next.
              localStorage.setItem(FCM_TOKEN_KEY, t.value);
            } catch {
              /* storage may be blocked; registration still works */
            }
            try {
              const { registerFcmToken } = await import("@/lib/actions/push");
              const { App } = await import("@capacitor/app");
              const info = await App.getInfo().catch(() => null);
              await registerFcmToken(t.value, info ? `${info.version} (${info.build})` : undefined);
            } catch (err) {
              console.warn("[push] token registration failed:", err);
            }
          }),
        );

        handles.push(
          await PushNotifications.addListener("registrationError", (err) => {
            // Almost always a missing/!mismatched google-services.json.
            console.warn("[push] FCM registration error:", JSON.stringify(err));
          }),
        );

        // Fires for an FCM notification received while the app is open.
        handles.push(
          await PushNotifications.addListener("pushNotificationReceived", (notification) => {
            void recordBroadcast(notification);
          }),
        );

        // Tap on a notification while the app is backgrounded or killed.
        handles.push(
          await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
            void recordBroadcast(action.notification);
            const url = action.notification?.data?.url;
            if (typeof url === "string" && url.startsWith("/")) router.push(url);
          }),
        );

        // A background/closed-app broadcast is displayed by Android, not JS.
        // Import any banner that is still in the shade when the app next opens.
        const delivered = await PushNotifications.getDeliveredNotifications();
        await Promise.all(delivered.notifications.map((notification) => recordBroadcast(notification)));

        await PushNotifications.register();
      } catch (err) {
        console.warn("[push] FCM setup failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      handles.forEach((h) => void h.remove());
      wired.current = false;
    };
  }, [router]);

  return null;
}
