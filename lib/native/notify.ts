import { Capacitor } from "@capacitor/core";

/**
 * Fire a native local notification (Android). No-op on web — the web build
 * relies on server-side web push instead. Used so SMS "allocate it" and
 * near-limit alerts are visible inside the Capacitor shell, where the Web Push
 * API isn't available.
 */
let permissionAsked = false;
let counter = 1;

export async function notifyLocal(p: {
  title: string;
  body: string;
  url?: string;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    if (!permissionAsked) {
      permissionAsked = true;
      try {
        await LocalNotifications.requestPermissions();
      } catch {
        /* user may decline */
      }
    }
    await LocalNotifications.schedule({
      notifications: [
        {
          id: (Date.now() % 100000) + counter++,
          title: p.title,
          body: p.body,
          extra: p.url ? { url: p.url } : undefined,
        },
      ],
    });
  } catch (err) {
    console.warn("[notifyLocal] failed:", err);
  }
}
