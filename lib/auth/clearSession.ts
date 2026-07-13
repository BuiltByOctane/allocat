import { clearDB } from "@/lib/db/hydrate";

/**
 * localStorage keys holding per-account / personal state. Cleared on logout and
 * account deletion so the next account on the same device never inherits the
 * previous user's settings, onboarding flags or cached insights.
 *
 * Device-level keys are intentionally PRESERVED: `allocat-device-id` (SMS dedupe
 * identity), `allocat-accent` / next-themes theme (cosmetic — clearing them
 * would flash on next paint), and the PWA / native install flags.
 */
export const ACCOUNT_SCOPED_LS_KEYS = [
  "allocat-tour-state",
  "allocat-confirm-autoallocate",
  "allocat-notif-sound",
  "allocat-weekly-insights",
  "allocat-debt-reminders",
  "allocat-insight-cache",
  "allocat-feedback-asked-at",
  "allocat-firstrun-dismissed",
  "allocat-trial-welcome-seen",
  "push-prompt-sessions",
  "push-prompt-dismissed",
  "mobile-hint-dismissed",
  "allocat-quiz-draft",
] as const;

/** Removes the account-scoped keys from the given storage. Pure — testable. */
export function clearAccountLocalStorage(storage: Pick<Storage, "removeItem">): void {
  for (const key of ACCOUNT_SCOPED_LS_KEYS) {
    storage.removeItem(key);
  }
}

/**
 * Wipes all client-side state tied to the signed-in account — the IndexedDB
 * cache and account-scoped localStorage. Call BEFORE navigating away on logout
 * or account deletion, then pair with a hard navigation (`window.location`) so
 * the in-memory React Query cache and provider state are dropped too. Best
 * effort: never throws.
 */
export async function clearClientSession(): Promise<void> {
  try {
    await clearDB();
  } catch {
    /* best effort — IDB may be unavailable */
  }
  try {
    if (typeof window !== "undefined") clearAccountLocalStorage(window.localStorage);
  } catch {
    /* best effort */
  }
}
