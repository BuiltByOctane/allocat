/**
 * Best-effort stable per-install identifier used as a secondary trial-abuse
 * signal (alongside the account-bound trial_started_at). Persisted in
 * localStorage so it survives reloads within the same install.
 *
 * NOTE: this is NOT a hardware id. When the native Adapty/billing phase lands,
 * swap in `@capacitor/device`'s `getId()` for a real Android device id on native.
 */
const KEY = "allocat-device-id";

export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}
