/**
 * Turns the text an iPhone shortcut POSTs into the extracted fields we store —
 * the same rules `ingestSmsClient` applies on Android, minus the IDB parts.
 *
 * The shortcut sends only the message body (iOS does not reliably expose the
 * sender to Shortcuts), so `sender` is always empty here. The dedupe and
 * template hashes are still stable per message, which is all they need to be.
 *
 * Pure: no network, no Supabase. The raw text never leaves this function —
 * callers get the extracted fields and one-way hashes only.
 */
import { parseTransactionSms, isOtpOrVerification } from "@/lib/ai/parseSmsTransaction";
import { txnDedupeKey, smsTemplateKey } from "@/lib/sms/match";

/** Longest body accepted. Real bank SMS are < 500 chars; concatenated ones < 1600. */
export const MAX_SHORTCUT_TEXT = 2000;

export type ShortcutSkipReason =
  | "empty"
  | "too-long"
  | "otp"
  | "no-amount"
  | "credit"
  | "no-debit";

export interface PreparedShortcutTxn {
  amount: number;
  currency: string | null;
  merchantRaw: string | null;
  direction: "debit";
  dedupeKey: string;
  templateKey: string;
}

export type PrepareResult =
  | { ok: true; txn: PreparedShortcutTxn }
  | { ok: false; reason: ShortcutSkipReason };

export function prepareShortcutSms(text: unknown): PrepareResult {
  if (typeof text !== "string") return { ok: false, reason: "empty" };
  const raw = text.trim();
  if (!raw) return { ok: false, reason: "empty" };
  if (raw.length > MAX_SHORTCUT_TEXT) return { ok: false, reason: "too-long" };

  // Same order as ingestSmsClient: a pre-auth "Confirm debit … OTP" must never
  // duplicate the real debit that follows it.
  if (isOtpOrVerification(raw)) return { ok: false, reason: "otp" };

  const parsed = parseTransactionSms(raw);
  if (parsed.amount === null || parsed.amount <= 0) {
    return { ok: false, reason: "no-amount" };
  }
  // Only confirmed debits — an amount with no debit cue is not assumed a spend.
  if (parsed.direction !== "debit") {
    return { ok: false, reason: parsed.direction === "credit" ? "credit" : "no-debit" };
  }

  return {
    ok: true,
    txn: {
      amount: parsed.amount,
      currency: parsed.currency,
      merchantRaw: parsed.merchant,
      direction: "debit",
      dedupeKey: txnDedupeKey({ sender: null, raw }),
      templateKey: smsTemplateKey({ sender: null, raw }),
    },
  };
}
