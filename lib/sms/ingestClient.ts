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
import { parseTransactionSms, isOtpOrVerification } from "@/lib/ai/parseSmsTransaction";
import { normalizeMerchant, matchMerchantRules, txnDedupeKey, smsTemplateKey } from "@/lib/sms/match";
import type { MerchantRule } from "@/lib/sms/match";
import { selectRuleForPeriod, type RuleResolutionContext } from "@/lib/sms/resolveRuleItem";
import { detectAppSource } from "@/lib/sms/appSource";
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

/**
 * Load the resolver context (budget + its items) for a period from IDB — mirror
 * of the server's loadPeriodContext. Reads the budget for the SMS's occurred_at
 * month (fallback: now) and its items. See lib/sms/resolveRuleItem.ts.
 */
async function loadPeriodContextIDB(
  occurredAt: string | null | undefined,
): Promise<RuleResolutionContext> {
  const db = getDB();
  const d = occurredAt ? new Date(occurredAt) : new Date();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();

  const budget = await db.budgets
    .where("[month+year]")
    .equals([month, year])
    .first();

  let items: RuleResolutionContext["items"] = [];
  if (budget) {
    const cats = await db.categories
      .where("budget_id")
      .equals(budget.id)
      .toArray();
    const itemArrays = await Promise.all(
      cats.map((c) =>
        db.budget_items.where("category_id").equals(c.id).toArray(),
      ),
    );
    items = itemArrays.flat().map((i) => ({
      id: i.id,
      template_id: i.template_id ?? null,
      template_item_id: i.template_item_id ?? null,
    }));
  }

  return {
    budget: budget
      ? { id: budget.id, template_id: budget.template_id ?? null }
      : null,
    items,
  };
}

export async function ingestSmsClient(
  input: { raw: string; sender?: string | null; receivedAt?: number },
  deps: { enqueue: EnqueueFn },
  opts: { silent?: boolean } = {},
): Promise<IngestClientResult> {
  const db = getDB();
  const raw = input.raw.trim();
  const sender = input.sender ?? null;
  if (!raw) return { skipped: true, reason: "empty" };

  // OTP / verification / pre-auth SMS are not transactions — drop early so a
  // pre-auth "Confirm debit … OTP" can't duplicate the real debit that follows.
  if (isOtpOrVerification(raw)) return { skipped: true, reason: "otp" };

  // Dedupe against anything already captured on this device.
  const dedupeKey = txnDedupeKey({ sender, raw });

  // Template key identifies the *kind* of SMS (not the specific txn). If the user
  // has reported this template as wrongly captured, skip the whole template.
  const templateKey = smsTemplateKey({ sender, raw });
  const blocked = await db.sms_blocklist.toArray();
  if (blocked.some((b) => b.template_key === templateKey)) {
    return { skipped: true, reason: "blocked" };
  }

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
    // When the transaction happened, as a full ISO timestamp. The native receiver
    // hands us the SMS receipt time (epoch ms) — authoritative and precise. The
    // text parser only ever yields a DATE-ONLY string (no clock time); storing
    // that rendered as 00:00 UTC = 05:30 IST on display (the "always 5:30" bug),
    // so we never use it for occurred_at. Fall back to now only for the dev paste
    // harness, which has no real receipt time.
    const occurredAt = new Date(
      input.receivedAt ?? Date.now(),
    ).toISOString();

    // Nothing spendable parsed → not worth recording.
    if (amount === null || amount <= 0) {
      return { skipped: true, reason: "no-amount" };
    }

    // Only track confirmed debits (spends). Credits are ignored; an ambiguous
    // SMS with an amount but no debit/credit cue is NOT assumed to be a spend
    // (that fallback let OTP/verification noise through). Card spends still pass
    // — extractDirection returns "debit" for them via CARD_SPEND_RE.
    if (direction !== "debit") {
      return { skipped: true, reason: direction === "credit" ? "credit" : "no-debit" };
    }

    const isDebit = true;
    const merchantNormalized = merchant ? normalizeMerchant(merchant) : null;
    // Derive the originating UPI/payment app from the sender, on-device. The
    // sender itself stays local — only this short label (e.g. "gpay") syncs.
    const appSource = detectAppSource(sender);

    // Match learned rules from IDB (holds only the current user's rows), then
    // pick the first that resolves to THIS month's item — a rule keyed to last
    // month's template item maps onto this month's item; stale/duplicate rules
    // that no longer resolve are skipped (never shadow a working one). No
    // resolution → leave pending. See lib/sms/resolveRuleItem.ts.
    let rule: MerchantRule | null = null;
    let resolvedItemId: string | null = null;
    if (isDebit && merchant) {
      const candidates = matchMerchantRules(
        merchant,
        (await db.merchant_rules.toArray()) as MerchantRule[],
      );
      if (candidates.length > 0) {
        const ctx = await loadPeriodContextIDB(occurredAt);
        const sel = selectRuleForPeriod(candidates, ctx);
        if (sel) {
          rule = sel.rule;
          resolvedItemId = sel.itemId;
        }
      }
    }
    const autoApplied = Boolean(resolvedItemId);

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
          budget_item_id: autoApplied ? resolvedItemId : null,
          label: null,
          source: "sms",
          original_amount: null,
          app_source: appSource,
          created_at: now,
        });

        // Optimistically reflect an auto-applied spend in the resolved item.
        if (autoApplied && resolvedItemId) {
          const item = await db.budget_items.get(resolvedItemId);
          if (item) {
            await db.budget_items.update(resolvedItemId, {
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
        templateKey,
        appSource,
      },
    });

    // Device-visible notifications (native local notifications; no-op on web).
    // Suppressed when draining the native queue — the receiver already notified.
    const money = (v: number) =>
      formatCurrency(v, { code: currency ?? "INR", maximumFractionDigits: 0 });

    if (opts.silent) {
      return { txnId: tempId, autoApplied };
    }

    if (autoApplied && resolvedItemId) {
      const nl = await nearLimitFromIDB(resolvedItemId);
      if (nl) {
        await notifyLocal({
          title: nl.over ? "🙀 Budget blown!" : "😼 Budget's getting thin",
          body: nl.over
            ? `${nl.name} is over budget. The cat's out of the bag.`
            : `${nl.name} at ${Math.round(nl.ratio * 100)}% — only ${money(nl.remaining)} left. Tread softly.`,
          url: "/budget",
        });
      } else {
        const pace = await paceFromIDB(resolvedItemId);
        if (pace) {
          await notifyLocal({
            title: "🐾 Spending fast",
            body: `${pace.name} is on track to run out around the ${ordinal(pace.byDay)} — ease up to stay in budget.`,
            url: "/budget",
          });
        } else if (confirmAutoAllocate()) {
          // Subtle confirmation that a known merchant was auto-logged — names the
          // budget ITEM (falls back to category, then "your budget").
          const bi = await db.budget_items.get(resolvedItemId);
          const cat = bi ? await db.categories.get(bi.category_id) : null;
          const target = bi?.name || cat?.name || null;
          await notifyLocal({
            title: `🐾 Sorted: ${money(amount)}${target ? ` → ${target}` : ""}`,
            body: target ? `Auto-logged to ${target}.` : "Auto-logged to your budget.",
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
      if (typeof row.amount !== "number" || row.amount <= 0) continue;
      const candidates = matchMerchantRules(
        row.merchant_raw ?? row.merchant_normalized ?? "",
        rules,
      );
      if (candidates.length === 0) continue;

      // Resolve to the row's own period — this is the whole point of the re-apply
      // pass: a row that landed pending because its month's budget didn't exist
      // yet now resolves once that budget is created from the same template.
      // selectRuleForPeriod also skips stale/duplicate rules.
      const ctx = await loadPeriodContextIDB(row.occurred_at);
      const sel = selectRuleForPeriod(candidates, ctx);
      if (!sel) continue;
      const { rule, itemId: resolvedItemId } = sel;

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
            budget_item_id: resolvedItemId,
            matched_rule_id: rule.id,
          });
          const item = await db.budget_items.get(resolvedItemId);
          if (item) {
            await db.budget_items.update(resolvedItemId, {
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
            budgetItemId: resolvedItemId,
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
