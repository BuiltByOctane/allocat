/**
 * Single source of truth for the notification-sound catalog (mirror of
 * lib/theme/accents.ts). The `raw` field is the Android res/raw resource name
 * pushed to the native layer via SmsReader.setConfig; `preview` is a public/
 * asset the Profile selector plays on tap. Custom sound is Android-only — the
 * web Notification API can't set one — so the selector is gated to native.
 */
export type NotifSoundId = "meow" | "chime" | "ding" | "pop" | "default";

export interface NotifSound {
  id: NotifSoundId;
  label: string;
  /** res/raw resource name (no extension), or null for the system default. */
  raw: string | null;
  /** res/raw filename WITH extension — Capacitor createChannel wants this. */
  file: string | null;
  /** public/ path for tap-to-preview, or null when there's nothing to preview. */
  preview: string | null;
}

export const NOTIF_SOUNDS: NotifSound[] = [
  { id: "meow", label: "Cat", raw: "meow", file: "meow.mp3", preview: "/sounds/meow.mp3" },
  { id: "chime", label: "Chime", raw: "chime", file: "chime.wav", preview: "/sounds/chime.wav" },
  { id: "ding", label: "Ding", raw: "ding", file: "ding.wav", preview: "/sounds/ding.wav" },
  { id: "pop", label: "Pop", raw: "pop", file: "pop.wav", preview: "/sounds/pop.wav" },
  { id: "default", label: "System default", raw: null, file: null, preview: null },
];

/** Capacitor channel id for a sound — kept identical to the native SmsNotifier
 *  channel so app-open and closed-app paths share one system-settings entry. */
export function channelIdForSound(id: NotifSoundId): string {
  return "allocat_txn_v5_" + nativeSoundKey(id);
}

/** res/raw filename (with extension) for the sound, or null for system default. */
export function nativeSoundFile(id: NotifSoundId): string | null {
  return NOTIF_SOUNDS.find((s) => s.id === id)?.file ?? null;
}

export const DEFAULT_NOTIF_SOUND: NotifSoundId = "meow";

export function isNotifSoundId(value: unknown): value is NotifSoundId {
  return typeof value === "string" && NOTIF_SOUNDS.some((s) => s.id === value);
}

export function notifSoundLabel(id: NotifSoundId): string {
  return NOTIF_SOUNDS.find((s) => s.id === id)?.label ?? id;
}

/**
 * The string handed to the native layer: the raw resource name, or "default"
 * for the system sound. Matches what SmsConfig/SmsNotifier expect on Android.
 */
export function nativeSoundKey(id: NotifSoundId): string {
  return NOTIF_SOUNDS.find((s) => s.id === id)?.raw ?? "default";
}
