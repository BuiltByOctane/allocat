import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { logActivity, getUserCurrency, fmt } from "@/lib/server/activity-logger";
import { loadPeriodContext } from "@/lib/server/sms-period";
import { normalizeMerchant, matchMerchantRules, type MerchantRule } from "@/lib/sms/match";
import { selectRuleForPeriod } from "@/lib/sms/resolveRuleItem";
import type { PreparedShortcutTxn } from "@/lib/shortcut/prepare";

type Supa = SupabaseClient<Database>;

export type ShortcutIngestResult =
  | {
      status: "pending";
      txnId: string;
      amount: number;
      currency: string;
      merchant: string | null;
      /** Budget item a learned rule will allocate this to when the app opens. */
      suggestedItem: string | null;
    }
  | { status: "duplicate" }
  | { status: "blocked" };

/**
 * Store one shortcut-captured debit for `userId` as a PENDING sms_transactions
 * row — the server half of the iPhone capture path.
 *
 * Deliberately does not auto-apply a learned merchant rule here: `quickLogSpend`
 * (and the asset/debt cascade under it) is bound to the cookie session, which a
 * shortcut request does not have. Instead the row lands pending and the app's
 * `reapplyRulesToPending` allocates it the moment the PWA opens — exactly how
 * Android handles SMS that arrive while the app is closed. `suggestedItem` is a
 * read-only preview of that outcome for the shortcut's notification.
 *
 * Runs on the service-role client, so every query filters by `user_id`. Only
 * extracted fields and hashes are written; the message text is never passed in.
 */
export async function ingestShortcutTxn(
  supabase: Supa,
  userId: string,
  txn: PreparedShortcutTxn,
): Promise<ShortcutIngestResult> {
  const { data: existing } = await supabase
    .from("sms_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("dedupe_key", txn.dedupeKey)
    .maybeSingle();
  if (existing) return { status: "duplicate" };

  // The user reported this kind of message as "not a transaction".
  const { data: blocked } = await supabase
    .from("sms_blocklist")
    .select("id")
    .eq("user_id", userId)
    .eq("template_key", txn.templateKey)
    .maybeSingle();
  if (blocked) return { status: "blocked" };

  const curPromise = getUserCurrency(supabase, userId);
  const merchantNormalized = txn.merchantRaw ? normalizeMerchant(txn.merchantRaw) : null;
  const { data: row, error } = await supabase
    .from("sms_transactions")
    .insert({
      user_id: userId,
      amount: txn.amount,
      currency: txn.currency,
      merchant_raw: txn.merchantRaw,
      merchant_normalized: merchantNormalized,
      direction: txn.direction,
      occurred_at: new Date().toISOString(),
      dedupe_key: txn.dedupeKey,
      template_key: txn.templateKey,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) {
    // unique (user_id, dedupe_key): the same SMS raced in from a second
    // automation (two keywords matching one message).
    if (error.code === "23505") return { status: "duplicate" };
    throw new Error(error.message);
  }

  const currency = txn.currency ?? (await curPromise);
  const merchantLabel = txn.merchantRaw || merchantNormalized || "Unknown";
  const suggestedItem = await previewRuleItem(supabase, userId, txn.merchantRaw);

  await logActivity(supabase, userId, {
    action_type: "sms_txn_pending",
    category: "budget",
    title: `Unallocated transaction: ${fmt(txn.amount, currency)}`,
    description: `${fmt(txn.amount, currency)} at ${merchantLabel} from SMS`,
    metadata: { txnId: row.id, merchant: merchantLabel, amount: txn.amount, via: "ios-shortcut" },
  });

  return {
    status: "pending",
    txnId: row.id,
    amount: txn.amount,
    currency,
    merchant: txn.merchantRaw,
    suggestedItem,
  };
}

/** Name of the budget item a learned rule would allocate this merchant to, if any. */
async function previewRuleItem(
  supabase: Supa,
  userId: string,
  merchant: string | null,
): Promise<string | null> {
  if (!merchant) return null;
  const { data: rules } = await supabase
    .from("merchant_rules")
    .select("*")
    .eq("user_id", userId);
  const candidates = matchMerchantRules(merchant, (rules ?? []) as MerchantRule[]);
  if (candidates.length === 0) return null;

  const ctx = await loadPeriodContext(supabase, userId, new Date().toISOString());
  const sel = selectRuleForPeriod(candidates, ctx);
  if (!sel) return null;

  const { data: item } = await supabase
    .from("budget_items")
    .select("name")
    .eq("id", sel.itemId)
    .eq("user_id", userId)
    .maybeSingle();
  return item?.name ?? null;
}
