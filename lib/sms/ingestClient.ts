/**
 * Client-side SMS ingestion pipeline. Shared by the dev paste-SMS harness and
 * the native SMS bridge. Parses on-device (regex, LLM fallback), writes an
 * optimistic IDB record, and enqueues the authoritative server ingest.
 */
import { getDB } from "@/lib/db";
import type { SyncQueueItem } from "@/lib/db";
import { parseTransactionSms } from "@/lib/ai/parseSmsTransaction";
import { normalizeMerchant, matchMerchantRule, txnDedupeKey } from "@/lib/sms/match";
import type { MerchantRule } from "@/lib/sms/match";
import { parseSmsWithLLM } from "@/lib/actions/sms";
import { randomUUID } from "@/lib/utils/uuid";
import { notifyLocal } from "@/lib/native/notify";
import { nearLimitFromIDB } from "@/lib/sms/nearLimit";
import { formatCurrency } from "@/lib/number-format";

type EnqueueFn = (
  item: Omit<SyncQueueItem, "id" | "retries" | "status" | "createdAt">,
) => Promise<void>;

const LLM_FALLBACK_BELOW = 0.6;

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

  // Tier 1: regex. Tier 2: LLM fallback when confidence is low.
  const parsed = parseTransactionSms(raw, sender ?? undefined);
  let amount = parsed.amount;
  let currency = parsed.currency;
  let merchant = parsed.merchant;
  let direction = parsed.direction;
  let occurredAt = parsed.occurredAt;

  if (parsed.confidence < LLM_FALLBACK_BELOW || amount === null) {
    try {
      const llm = await parseSmsWithLLM(raw);
      if (llm) {
        amount = amount ?? llm.amount;
        currency = currency ?? llm.currency;
        merchant = merchant ?? llm.merchant;
        direction = direction ?? llm.direction;
        occurredAt = occurredAt ?? llm.occurredAt;
      }
    } catch {
      // Offline / no key — keep the regex result.
    }
  }

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

  await deps.enqueue({
    table: "sms_transactions",
    operation: "INSERT",
    recordId: tempId,
    tempId,
    payload: {
      raw,
      sender,
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
