/**
 * Derive which UPI / payment app a transaction SMS is associated with, purely
 * on-device, from the SMS sender id AND body. Neither leaves the device — only
 * the short canonical label returned here is low-sensitivity enough to sync
 * (like the merchant name).
 *
 * IMPORTANT — what this can and cannot know:
 * A bank debit SMS is sent by the BANK (sender like "AD-HDFCBK"), not by the app
 * you paid with, so the sender almost never names GPay/PhonePe/Paytm. The only
 * app signal usually present is in the BODY:
 *   1. an explicit app mention ("via Google Pay", "thru PhonePe") — high
 *      confidence, but rare; and
 *   2. the counterparty's UPI VPA handle suffix (e.g. "merchant@okhdfcbank") —
 *      common, but it reflects the PAYEE's PSP/app, which only *often* matches
 *      the payer's app. Best-effort, not guaranteed.
 * When no signal is present we return null and the UI shows no badge.
 */

/** Canonical app keys we recognise. */
export type AppSourceKey =
  | "gpay"
  | "phonepe"
  | "paytm"
  | "amazonpay"
  | "cred"
  | "bhim";

/**
 * Lenient (substring → key) table for the SENDER id only. A sender token like
 * "AD-GPAY-S" or "JK-PAYTMB" is unambiguous, so a bare substring is safe here.
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
 * Strict app-name mentions for the BODY. Stricter than the sender table because
 * a body can contain a merchant name (e.g. you bought from "Amazon" while paying
 * with GPay) — so e.g. Amazon Pay must say "amazon pay", not bare "amazon".
 */
const BODY_NAME_PATTERNS: Array<[RegExp, AppSourceKey]> = [
  [/google ?pay|\bg-?pay\b/i, "gpay"],
  [/phone ?pe|phonpe|phonepay|phonepy/i, "phonepe"],
  [/\bpaytm\b/i, "paytm"],
  [/amazon ?pay/i, "amazonpay"],
  [/\bcred\b/i, "cred"],
  [/\bbhim\b/i, "bhim"],
];

/**
 * UPI VPA handle suffix → app. The suffix is the part after "@" in a VPA like
 * "name@okhdfcbank" — the public PSP handle namespaces each app issues.
 * (Best-effort: this is the counterparty's handle.)
 */
const HANDLE_SUFFIXES: Array<[RegExp, AppSourceKey]> = [
  [/^ok[a-z]+$/, "gpay"], // Google Pay: @okaxis, @okhdfcbank, @okicici, @oksbi
  [/^(ybl|ibl|axl)$/, "phonepe"],
  [/^(paytm|pt[a-z]+)$/, "paytm"],
  [/^(apl|yapl|rapl)$/, "amazonpay"],
  [/^upi$/, "bhim"],
];

/** Pull the first UPI VPA handle suffix (after "@") out of an SMS body, if any. */
function vpaHandleSuffix(text: string): string | null {
  const m = text.match(/[a-z0-9.\-_]{2,}@([a-z][a-z0-9]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Map a raw SMS (sender + optional body) to a canonical payment-app key, or null
 * when no signal is present. Safe with null/undefined input (the dev harness /
 * web have no sender or body).
 */
export function detectAppSource(
  sender: string | null | undefined,
  body?: string | null | undefined,
): AppSourceKey | null {
  // 1. Sender id — lenient substring match (unambiguous token).
  if (sender) {
    const s = sender.toLowerCase();
    for (const [needle, key] of SENDER_PATTERNS) {
      if (s.includes(needle)) return key;
    }
  }

  if (!body) return null;

  // 2. Explicit app name in the body — strict (avoid merchant-name collisions).
  for (const [re, key] of BODY_NAME_PATTERNS) {
    if (re.test(body)) return key;
  }

  // 3. Counterparty VPA handle suffix in the body — best-effort fallback.
  const suffix = vpaHandleSuffix(body);
  if (suffix) {
    for (const [re, key] of HANDLE_SUFFIXES) {
      if (re.test(suffix)) return key;
    }
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
  bhim: { label: "BHIM", color: "#00729f" },
};

/** Resolve a stored app_source value to its display metadata, or null. */
export function appSourceDisplay(
  source: string | null | undefined,
): AppSourceDisplay | null {
  if (!source) return null;
  return APP_SOURCE_DISPLAY[source] ?? null;
}
