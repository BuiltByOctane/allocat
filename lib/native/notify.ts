import { Capacitor } from "@capacitor/core";
import { notifSound } from "@/lib/sms/notifPrefs";
import { channelIdForSound, nativeSoundFile } from "@/lib/native/notifSounds";

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
    // Channel sound is frozen at creation, so use one channel per chosen sound
    // (same id as the native closed-app path → a single system-settings entry).
    const soundId = notifSound();
    const channelId = channelIdForSound(soundId);
    const soundFile = nativeSoundFile(soundId);
    try {
      await LocalNotifications.createChannel({
        id: channelId,
        name: "Transactions",
        description: "Transaction + budget alerts",
        importance: 4,
        visibility: 1,
        vibration: true,
        ...(soundFile ? { sound: soundFile } : {}),
      });
    } catch {
      /* channel may already exist */
    }
    await LocalNotifications.schedule({
      notifications: [
        {
          id: (Date.now() % 100000) + counter++,
          title: p.title,
          body: p.body,
          channelId,
          extra: p.url ? { url: p.url } : undefined,
        },
      ],
    });
  } catch (err) {
    console.warn("[notifyLocal] failed:", err);
  }
}
