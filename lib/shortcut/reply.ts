/**
 * What the iPhone shortcut shows the user. The shortcut is deliberately dumb —
 * it only displays `notify` when present — so every word lives here and can
 * change without anyone reinstalling the shortcut (re-adding it from the
 * iCloud link switches the user's automation off).
 */
import { formatCurrency } from "@/lib/number-format";

export const SHORTCUT_GUIDE_URL = "allocat.xyz/guides/iphone-sms";

export type ShortcutReplyStatus =
  | "pending"
  | "connected"
  | "duplicate"
  | "blocked"
  | "skipped"
  | "needs-key"
  | "invalid-key"
  | "disabled"
  | "rate-limited"
  | "error";

export interface ShortcutReply {
  status: ShortcutReplyStatus;
  /** Notification text. Absent ⇒ the shortcut stays silent. */
  notify?: string;
}

export interface PendingSpend {
  txnId: string;
  amount: number;
  currency: string;
  merchant: string | null;
  /** Budget item a learned rule will allocate this to when the app opens. */
  suggestedItem: string | null;
}

function moneyText(p: PendingSpend): string {
  return formatCurrency(p.amount, { code: p.currency, maximumFractionDigits: 0 });
}

/**
 * Web push for a captured spend — the preferred notification, because tapping
 * it opens AlloCat (a Shortcuts notification can only open the Shortcuts app).
 * Same wording as the Android capture path.
 */
export function pendingPush(p: PendingSpend): {
  title: string;
  body: string;
  url: string;
  tag: string;
} {
  const money = moneyText(p);
  if (p.suggestedItem) {
    return {
      title: `🐾 Sorted: ${money} → ${p.suggestedItem}`,
      body: `Auto-logged to ${p.suggestedItem}.`,
      url: "/sms",
      tag: `sms-txn-${p.txnId}`,
    };
  }
  return {
    title: "🐾 A wild spend appeared!",
    body: `${money} at ${p.merchant ?? "someone"}. Tap to give it a home.`,
    url: `/sms?txn=${p.txnId}`,
    tag: `sms-txn-${p.txnId}`,
  };
}

/**
 * Reply to the shortcut. When the web push already reached the iPhone the
 * shortcut stays silent (no double notification); otherwise it shows its own,
 * which works without push but opens the Shortcuts app when tapped.
 */
export function pendingReply(p: PendingSpend, pushReachedPhone = false): ShortcutReply {
  if (pushReachedPhone) return { status: "pending" };
  const money = moneyText(p);
  const where = p.merchant ? ` at ${p.merchant}` : "";
  return {
    status: "pending",
    notify: p.suggestedItem
      ? `🐾 ${money}${where} → ${p.suggestedItem}`
      : `🐾 ${money}${where}. Waiting in AlloCat to be allocated.`,
  };
}

/** True when a push was delivered to an iPhone/iPad (by the UA stored at subscribe time). */
export function reachedIosDevice(userAgents: Array<string | null> | undefined): boolean {
  return (userAgents ?? []).some((ua) => /iPhone|iPad|iPod/.test(ua ?? ""));
}

export const CONNECTED_REPLY: ShortcutReply = {
  status: "connected",
  notify: "✅ AlloCat is connected. Bank SMS spends will be logged automatically.",
};

export const NEEDS_KEY_REPLY: ShortcutReply = {
  status: "needs-key",
  notify: `Paste your AlloCat key into the shortcut first. Help: ${SHORTCUT_GUIDE_URL}`,
};

export const INVALID_KEY_REPLY: ShortcutReply = {
  status: "invalid-key",
  notify: `This AlloCat key no longer works. Get a new one in AlloCat → SMS. Help: ${SHORTCUT_GUIDE_URL}`,
};
