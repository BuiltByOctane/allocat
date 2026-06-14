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
import { confirmAutoAllocate } from "@/lib/sms/notifPrefs";
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

/**
 * Dedupe keys currently mid-ingest in THIS tab. The same SMS can arrive twice
 * almost simultaneously (a live `smsReceived` event AND the queue drain on
 * open), and both would clear the IDB dedupe check before either has written
 * its row. This synchronous in-memory gate rejects the second caller before it
 * even starts; the readwrite transaction below is the durable backstop.
 */
const inFlight = new Set<string>();

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

  // In-memory guard: reject a concurrent ingest of the SAME SMS synchronously,
  // before its async dedupe check (which the first caller hasn't satisfied yet).
  if (inFlight.has(dedupeKey)) {
    return { skipped: true, reason: "in-flight" };
  }
  inFlight.add(dedupeKey);
  try {
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

    // Atomic dedupe-then-insert. Two ingests racing past the check above (e.g.
    // across a reload, where the in-memory Set was reset) are serialized by this
    // readwrite transaction: it RE-CHECKS the dedupe key immediately before the
    // add, so the loser sees the winner's row and aborts. The budget_items
    // increment is in the same transaction so an auto-applied spend is all-or-
    // nothing with the row insert.
    const txnResult = await db.transaction(
      "rw",
      db.sms_transactions,
      db.budget_items,
      async (): Promise<IngestClientResult | null> => {
        const raceDup = await db.sms_transactions
          .where("dedupe_key")
          .equals(dedupeKey)
          .first();
        if (raceDup) {
          return { skipped: true, reason: "duplicate", txnId: raceDup.id };
        }

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
        return null; // inserted — continue with enqueue + notify below
      },
    );

    // The transaction detected a duplicate (race lost) — stop, don't enqueue.
    if (txnResult) return txnResult;

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
        } else if (confirmAutoAllocate()) {
          // Subtle confirmation that a known merchant was auto-logged.
          const bi = await db.budget_items.get(rule.budget_item_id);
          const cat = bi ? await db.categories.get(bi.category_id) : null;
          await notifyLocal({
            title: `🐾 Sorted: ${money(amount)}${cat ? ` → ${cat.name}` : ""}`,
            body: cat ? `Auto-logged to ${cat.name}.` : "Auto-logged to your budget.",
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
  } finally {
    inFlight.delete(dedupeKey);
  }
}

/** Serializes reapplyRulesToPending so two callers can't double-apply a row. */
let reapplyRunning = false;

/**
 * Defense-in-depth for the cold-open race: SMS drained BEFORE merchant_rules
 * were hydrated land as `pending` even though the user already has an auto-apply
 * rule for that merchant. Once rules are in IDB, this re-matches every pending
 * row and locally categorizes the ones that now match an auto-apply rule —
 * mirroring what ingestSmsClient would have done — and enqueues a CATEGORIZE so
 * the server agrees.
 *
 * Idempotent: each row is advanced inside a readwrite transaction that re-checks
 * the row is still `pending` before touching it, so a re-run (or an overlapping
 * call) never increments a budget item twice.
 */
export async function reapplyRulesToPending(deps: {
  enqueue: EnqueueFn;
}): Promise<{ applied: number }> {
  if (reapplyRunning) return { applied: 0 };
  reapplyRunning = true;
  try {
    const db = getDB();
    const rules = (await db.merchant_rules.toArray()) as MerchantRule[];
    if (rules.length === 0) return { applied: 0 };

    const pending = await db.sms_transactions
      .where("status")
      .equals("pending")
      .toArray();

    let applied = 0;
    for (const row of pending) {
      if (!row.merchant_raw && !row.merchant_normalized) continue;
      const rule = matchMerchantRule(
        row.merchant_raw ?? row.merchant_normalized ?? "",
        rules,
      );
      if (!rule || !rule.auto_apply) continue;
      if (typeof row.amount !== "number" || row.amount <= 0) continue;

      // Atomic per-row apply with a status re-check → safe to call repeatedly.
      const didApply = await db.transaction(
        "rw",
        db.sms_transactions,
        db.budget_items,
        async (): Promise<boolean> => {
          const fresh = await db.sms_transactions.get(row.id);
          if (!fresh || fresh.status !== "pending") return false;
          await db.sms_transactions.update(row.id, {
            status: "categorized",
            budget_item_id: rule.budget_item_id,
            matched_rule_id: rule.id,
          });
          const item = await db.budget_items.get(rule.budget_item_id);
          if (item) {
            await db.budget_items.update(rule.budget_item_id, {
              actual_amount: Number(item.actual_amount) + (row.amount as number),
            });
          }
          return true;
        },
      );

      if (didApply) {
        applied += 1;
        // The rule already exists — don't relearn it.
        await deps.enqueue({
          table: "sms_transactions",
          operation: "CATEGORIZE",
          recordId: row.id,
          payload: {
            txnId: row.id,
            budgetItemId: rule.budget_item_id,
            rememberRule: false,
            matchType: rule.match_type,
          },
        });
      }
    }
    return { applied };
  } finally {
    reapplyRunning = false;
  }
}
