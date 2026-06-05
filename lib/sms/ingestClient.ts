/**
 * Client-side SMS ingestion pipeline. Shared by the dev paste-SMS harness and
 * the native SMS bridge. Parses entirely on-device (regex), writes an optimistic
 * IDB record, and enqueues the authoritative server ingest.
 *
 * Privacy / Play policy: the raw SMS body and sender never leave the device — the
 * local IDB row keeps them for display/debug, but only the extracted fields
 * (amount, merchant, etc.) and a hashed dedupe key are synced to the server. No
 * SMS content is sent to any third party.
 */
import { getDB } from "@/lib/db";
import type { SyncQueueItem } from "@/lib/db";
import { parseTransactionSms } from "@/lib/ai/parseSmsTransaction";
import { normalizeMerchant, matchMerchantRule, txnDedupeKey } from "@/lib/sms/match";
import type { MerchantRule } from "@/lib/sms/match";
import { randomUUID } from "@/lib/utils/uuid";
import { notifyLocal } from "@/lib/native/notify";
import { nearLimitFromIDB, paceFromIDB, ordinal } from "@/lib/sms/nearLimit";
import { formatCurrency } from "@/lib/number-format";

type EnqueueFn = (
  item: Omit<SyncQueueItem, "id" | "retries" | "status" | "createdAt">,
) => Promise<void>;

export interface IngestClientResult {
  skipped?: boolean;
  reason?: string;
  txnId?: string;
  autoApplied?: boolean;
}

export async function ingestSmsClient(
  input: { raw: string; sender?: string | null },
  deps: { enqueue: EnqueueFn },
  opts: { silent?: boolean } = {},
): Promise<IngestClientResult> {
  const db = getDB();
  const raw = input.raw.trim();
  const sender = input.sender ?? null;
  if (!raw) return { skipped: true, reason: "empty" };

  // Dedupe against anything already captured on this device.
  const dedupeKey = txnDedupeKey({ sender, raw });
  const dup = await db.sms_transactions
    .where("dedupe_key")
    .equals(dedupeKey)
    .first();
  if (dup) return { skipped: true, reason: "duplicate", txnId: dup.id };

  // On-device regex parse (no network, no third party). Low-confidence SMS that
  // yield no amount simply fall through to the user's manual /sms allocation.
  const parsed = parseTransactionSms(raw, sender ?? undefined);
  const amount = parsed.amount;
  const currency = parsed.currency;
  const merchant = parsed.merchant;
  const direction = parsed.direction;
  const occurredAt = parsed.occurredAt;

  // Nothing spendable parsed → not worth recording.
  if (amount === null || amount <= 0) {
    return { skipped: true, reason: "no-amount" };
  }

  // Only track debits (spends). Credits (income / received money) are ignored.
  if (direction === "credit") return { skipped: true, reason: "credit" };

  const isDebit = true;
  const merchantNormalized = merchant ? normalizeMerchant(merchant) : null;

  // Match a learned rule from IDB (holds only the current user's rows).
  let rule: MerchantRule | null = null;
  if (isDebit && merchant) {
    const rules = (await db.merchant_rules.toArray()) as MerchantRule[];
    rule = matchMerchantRule(merchant, rules);
  }
  const autoApplied = Boolean(isDebit && rule && rule.auto_apply);

  const tempId = `temp_${randomUUID()}`;
  const now = new Date().toISOString();
  const status = !isDebit
    ? "ignored"
    : autoApplied
      ? "categorized"
      : "pending";

  await db.sms_transactions.add({
    id: tempId,
    user_id: "__pending__",
    raw_text: raw,
    sender,
    amount,
    currency,
    merchant_raw: merchant,
    merchant_normalized: merchantNormalized,
    direction,
    occurred_at: occurredAt,
    dedupe_key: dedupeKey,
    status,
    matched_rule_id: autoApplied ? (rule?.id ?? null) : null,
    budget_item_id: autoApplied ? (rule?.budget_item_id ?? null) : null,
    created_at: now,
  });

  // Optimistically reflect an auto-applied spend in the budget item.
  if (autoApplied && rule) {
    const item = await db.budget_items.get(rule.budget_item_id);
    if (item) {
      await db.budget_items.update(rule.budget_item_id, {
        actual_amount: Number(item.actual_amount) + amount,
      });
    }
  }

  // Sync only the extracted fields + hashed dedupe key. The raw SMS body and
  // sender stay on-device (in the IDB row above) and are deliberately omitted.
  await deps.enqueue({
    table: "sms_transactions",
    operation: "INSERT",
    recordId: tempId,
    tempId,
    payload: {
      amount,
      currency,
      merchantRaw: merchant,
      direction,
      occurredAt,
      dedupeKey,
    },
  });

  // Device-visible notifications (native local notifications; no-op on web).
  // Suppressed when draining the native queue — the receiver already notified.
  const money = (v: number) =>
    formatCurrency(v, { code: currency ?? "INR", maximumFractionDigits: 0 });

  if (opts.silent) {
    return { txnId: tempId, autoApplied };
  }

  if (autoApplied && rule) {
    const nl = await nearLimitFromIDB(rule.budget_item_id);
    if (nl) {
      await notifyLocal({
        title: nl.over ? "🙀 Budget blown!" : "😼 Budget's getting thin",
        body: nl.over
          ? `${nl.name} is over budget. The cat's out of the bag.`
          : `${nl.name} at ${Math.round(nl.ratio * 100)}% — only ${money(nl.remaining)} left. Tread softly.`,
        url: "/budget",
      });
    } else {
      const pace = await paceFromIDB(rule.budget_item_id);
      if (pace) {
        await notifyLocal({
          title: "🐾 Spending fast",
          body: `${pace.name} is on track to run out around the ${ordinal(pace.byDay)} — ease up to stay in budget.`,
          url: "/budget",
        });
      }
    }
  } else if (isDebit) {
    await notifyLocal({
      title: "🐾 A wild spend appeared!",
      body: `${money(amount)} at ${merchant ?? "someone"} — tap to give it a home.`,
      url: `/sms?txn=${tempId}`,
    });
  }

  return { txnId: tempId, autoApplied };
}
