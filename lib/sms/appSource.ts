/**
 * Derive which UPI / payment app a transaction SMS originated from, purely from
 * its sender id (e.g. "AD-GPAY-S", "VM-PHONPE", "JK-PAYTMB"). Runs on-device; the
 * sender itself NEVER leaves the device — only the short canonical label returned
 * here is low-sensitivity enough to sync (like the merchant name).
 *
 * Returns a stable canonical key (see APP_SOURCES) or null when no app is
 * recognised. Match is a case-insensitive substring test against the sender id.
 */

/** Canonical app keys we recognise. */
export type AppSourceKey = "gpay" | "phonepe" | "paytm" | "amazonpay" | "cred";

/**
 * Ordered (substring → key) table. Substrings are matched case-insensitively.
 * Order matters only if two substrings could co-occur — they don't in practice.
 */
const SENDER_PATTERNS: Array<[string, AppSourceKey]> = [
  ["googlepay", "gpay"],
  ["gpay", "gpay"],
  ["phonepe", "phonepe"],
  ["phonepy", "phonepe"],
  ["phonpe", "phonepe"],
  ["paytm", "paytm"],
  ["amazon", "amazonpay"],
  ["cred", "cred"],
];

/**
 * Map a raw SMS sender id to a canonical payment-app key, or null when unknown.
 * Safe with null/undefined input (the dev harness / web have no sender).
 */
export function detectAppSource(
  sender: string | null | undefined,
): AppSourceKey | null {
  if (!sender) return null;
  const s = sender.toLowerCase();
  for (const [needle, key] of SENDER_PATTERNS) {
    if (s.includes(needle)) return key;
  }
  return null;
}

export interface AppSourceDisplay {
  label: string;
  /** Brand-ish accent for the chip text/border (CSS color string). */
  color: string;
}

/** Display metadata for each canonical app key (UI badge label + accent). */
export const APP_SOURCE_DISPLAY: Record<string, AppSourceDisplay> = {
  gpay: { label: "GPay", color: "#1a73e8" },
  phonepe: { label: "PhonePe", color: "#5f259f" },
  paytm: { label: "Paytm", color: "#00b9f1" },
  amazonpay: { label: "Amazon Pay", color: "#ff9900" },
  cred: { label: "CRED", color: "#0a0a0a" },
};

/** Resolve a stored app_source value to its display metadata, or null. */
export function appSourceDisplay(
  source: string | null | undefined,
): AppSourceDisplay | null {
  if (!source) return null;
  return APP_SOURCE_DISPLAY[source] ?? null;
}
