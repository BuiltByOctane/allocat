"use server";

import { createClient } from "@/lib/supabase/server";
import { quickLogSpend, reverseSpend } from "@/lib/actions/budget";
import { notifyUser } from "@/lib/server/push-notify";
import { logActivity, getUserCurrency, fmt } from "@/lib/server/activity-logger";
import {
  normalizeMerchant,
  matchMerchantRule,
  type MerchantRule,
} from "@/lib/sms/match";
import {
  isAmountEdited,
  effectiveAmount,
  nextOriginalAmount,
} from "@/lib/sms/amountDelta";

/** Notify when a category crosses 90% / 100% of its allocation. */
const NEAR_LIMIT_RATIO = 0.9;

async function getAuthed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}

type Supa = Awaited<ReturnType<typeof createClient>>;

export interface IngestSmsInput {
  /**
   * Raw SMS body / sender are intentionally NOT sent from the client (kept
   * on-device). Declared optional only for the dev harness; never persisted.
   */
  raw?: string;
  sender?: string | null;
  amount: number | null;
  currency?: string | null;
  merchantRaw?: string | null;
  direction?: "debit" | "credit" | null;
  /** ISO date/timestamp string. */
  occurredAt?: string | null;
  dedupeKey: string;
  /**
   * One-way hash of the SMS *template* (sender + masked skeleton). If the user
   * has reported this template as wrongly captured, the server no-ops the ingest.
   */
  templateKey?: string | null;
  /**
   * Origin of the row. "sms" (default) runs the full rule-match / auto-apply
   * pipeline. "manual" inserts an already-categorized ledger row WITHOUT bumping
   * actual_amount (the manual spend's quickLogSpend/PAYMENT already did that).
   */
  source?: "sms" | "manual" | null;
  /** Initial status. For a manual spend this is "categorized". */
  status?: "pending" | "categorized" | "ignored" | "duplicate" | null;
  /** Budget item this row is allocated to (manual spends arrive pre-allocated). */
  budgetItemId?: string | null;
  /** Optional human-readable name for the transaction. */
  label?: string | null;
}

/**
 * Authoritative SMS ingestion. Called on SyncEngine flush. Idempotent: a repeat
 * with the same dedupeKey returns the existing row instead of inserting again.
 *
 * - debit + matching auto-apply rule → logs the spend and warns if near limit.
 * - debit + no rule                  → stores as pending, pushes "allocate it".
 * - credit                           → stored as informational (status ignored).
 */
export async function ingestSmsTransaction(input: IngestSmsInput) {
  const { supabase, user } = await getAuthed();

  // 1. Idempotent dedupe — re-delivered SMS or sync retries collapse here.
  // Return the FULL row: the sync engine replaces the IDB record with whatever
  // this returns, so a partial object would wipe status/amount and the txn
  // would vanish from the pending list.
  const { data: existing } = await supabase
    .from("sms_transactions")
    .select("*")
    .eq("user_id", user.id)
    .eq("dedupe_key", input.dedupeKey)
    .maybeSingle();
  if (existing) return existing;

  // 1a. Manual spend → ledger-only row. The manual budget spend already bumped
  // actual_amount via quickLogSpend (PAYMENT), so this inserts an
  // already-categorized record WITHOUT re-applying the spend or running the
  // rule-match / notification pipeline. Returns the full row so the sync engine
  // reconciles the optimistic temp_ row with the canonical server id.
  if (input.source === "manual") {
    const merchantNormalized = input.merchantRaw
      ? normalizeMerchant(input.merchantRaw)
      : null;
    const { data: manualTxn, error: manualErr } = await supabase
      .from("sms_transactions")
      .insert({
        user_id: user.id,
        amount: input.amount,
        currency: input.currency ?? null,
        merchant_raw: input.merchantRaw ?? null,
        merchant_normalized: merchantNormalized,
        direction: input.direction ?? "debit",
        occurred_at: input.occurredAt ?? null,
        dedupe_key: input.dedupeKey,
        status: input.status ?? "categorized",
        budget_item_id: input.budgetItemId ?? null,
        label: input.label ?? null,
        source: "manual",
        original_amount: null,
      })
      .select()
      .single();
    if (manualErr) throw new Error(manualErr.message);
    return manualTxn;
  }

  // 1b. Template blocklist — the user reported this kind of SMS as wrongly
  // captured. No-op so the same template never re-appears as a transaction.
  if (input.templateKey) {
    const { data: blocked } = await supabase
      .from("sms_blocklist")
      .select("id")
      .eq("user_id", user.id)
      .eq("template_key", input.templateKey)
      .maybeSingle();
    if (blocked) return { ok: true as const, blocked: true as const };
  }

  const merchantNormalized = input.merchantRaw
    ? normalizeMerchant(input.merchantRaw)
    : null;
  const isDebit = input.direction !== "credit";
  const actionable = isDebit && typeof input.amount === "number" && input.amount > 0;

  // 2. Server-authoritative rule match (rules may have changed since capture).
  let rule: MerchantRule | null = null;
  if (actionable && input.merchantRaw) {
    const { data: rows } = await supabase
      .from("merchant_rules")
      .select("*")
      .eq("user_id", user.id);
    rule = matchMerchantRule(input.merchantRaw, (rows ?? []) as MerchantRule[]);
  }

  // 3. Insert the transaction record.
  const initialStatus = !isDebit ? "ignored" : "pending";
  const { data: txn, error: insErr } = await supabase
    .from("sms_transactions")
    .insert({
      user_id: user.id,
      // raw_text / sender deliberately omitted — the raw SMS never leaves the
      // device; only extracted fields + the hashed dedupe_key are stored.
      amount: input.amount,
      currency: input.currency ?? null,
      merchant_raw: input.merchantRaw ?? null,
      merchant_normalized: merchantNormalized,
      direction: input.direction ?? null,
      occurred_at: input.occurredAt ?? null,
      dedupe_key: input.dedupeKey,
      status: initialStatus,
    })
    .select()
    .single();
  if (insErr) throw new Error(insErr.message);

  const cur = await getUserCurrency(supabase, user.id);
  const merchantLabel = input.merchantRaw || merchantNormalized || "Unknown";

  // 4a. Auto-apply a known merchant rule.
  if (actionable && rule && rule.auto_apply) {
    try {
      await quickLogSpend(rule.budget_item_id, input.amount as number, {
        kind: "sms",
        merchant: merchantLabel,
      });
      await supabase
        .from("sms_transactions")
        .update({
          status: "categorized",
          budget_item_id: rule.budget_item_id,
          matched_rule_id: rule.id,
        })
        .eq("id", txn.id)
        .eq("user_id", user.id);
      await supabase
        .from("merchant_rules")
        .update({ times_applied: (rule.times_applied ?? 0) + 1 })
        .eq("id", rule.id)
        .eq("user_id", user.id);

      await notifyIfNearLimit(supabase, user.id, rule.budget_item_id, cur);
      // Return the full row reflecting the final categorized state.
      return {
        ...txn,
        status: "categorized" as const,
        budget_item_id: rule.budget_item_id,
        matched_rule_id: rule.id,
      };
    } catch {
      // Fall through to manual categorization if the spend log failed.
    }
  }

  // 4b. Unknown debit → ask the user to allocate it.
  if (actionable) {
    await notifyUser(user.id, {
      title: "🐾 A wild spend appeared!",
      body: `${fmt(input.amount as number, cur)} at ${merchantLabel} — tap to give it a home.`,
      tag: `sms-txn-${txn.id}`,
      url: `/sms?txn=${txn.id}`,
    });
    await logActivity(supabase, user.id, {
      action_type: "sms_txn_pending",
      category: "budget",
      title: `Unallocated transaction: ${fmt(input.amount as number, cur)}`,
      description: `${fmt(input.amount as number, cur)} at ${merchantLabel} from SMS`,
      metadata: { txnId: txn.id, merchant: merchantLabel, amount: input.amount },
    });
  }

  // Full row (status "pending" for an unmatched debit, "ignored" for a credit).
  return txn;
}

export interface CategorizeSmsInput {
  txnId: string;
  budgetItemId: string;
  /** Persist a merchant rule so future SMS from this merchant auto-apply. */
  rememberRule?: boolean;
  matchType?: "exact" | "contains" | "regex";
  /** Optional human-readable name for the transaction (overrides merchant_raw in lists). */
  label?: string | null;
  /**
   * Edited spend amount. When provided and ≠ the parsed amount, the EDITED value
   * is logged against the budget item and persisted as `amount`; the original
   * parsed amount is preserved in `original_amount` (only if not already set).
   */
  amount?: number;
}

/** Apply a user's category choice to a pending SMS txn, optionally learning a rule. */
export async function categorizeSmsTransaction(input: CategorizeSmsInput) {
  const { supabase, user } = await getAuthed();

  const { data: txn } = await supabase
    .from("sms_transactions")
    .select("*")
    .eq("id", input.txnId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!txn) throw new Error("Transaction not found");
  if (txn.status === "categorized") return { ok: true, already: true as const };
  if (typeof txn.amount !== "number" || txn.amount <= 0)
    throw new Error("Transaction has no spendable amount");

  // Resolve the item's category (needed for rule + near-limit math).
  const { data: item } = await supabase
    .from("budget_items")
    .select("id, category_id")
    .eq("id", input.budgetItemId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!item) throw new Error("Budget item not found");

  // An edited amount logs the EDITED value (not the parsed one) and stashes the
  // original parsed amount the first time it changes.
  const edited = isAmountEdited(txn.amount, input.amount);
  const spendAmount = effectiveAmount(txn.amount, input.amount) as number;
  const originalAmount = nextOriginalAmount(
    txn.amount,
    txn.original_amount,
    input.amount,
  );

  await quickLogSpend(input.budgetItemId, spendAmount, {
    kind: "sms",
    merchant: txn.merchant_raw || txn.merchant_normalized || null,
  });

  let ruleId: string | null = null;
  if (input.rememberRule && txn.merchant_normalized) {
    const { data: rule } = await supabase
      .from("merchant_rules")
      .insert({
        user_id: user.id,
        match_type: input.matchType ?? "contains",
        pattern: txn.merchant_normalized,
        merchant_normalized: txn.merchant_normalized,
        budget_item_id: input.budgetItemId,
        category_id: item.category_id,
        auto_apply: true,
      })
      .select("id")
      .single();
    ruleId = rule?.id ?? null;
  }

  await supabase
    .from("sms_transactions")
    .update({
      status: "categorized",
      budget_item_id: input.budgetItemId,
      matched_rule_id: ruleId,
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(edited ? { amount: spendAmount, original_amount: originalAmount } : {}),
    })
    .eq("id", input.txnId)
    .eq("user_id", user.id);

  const cur = await getUserCurrency(supabase, user.id);
  await notifyIfNearLimit(supabase, user.id, input.budgetItemId, cur);

  return { ok: true, ruleCreated: Boolean(ruleId) };
}

export interface RecategorizeSmsInput {
  txnId: string;
  newBudgetItemId: string;
  label?: string | null;
  /**
   * Edited spend amount. When provided and ≠ the current amount, the budget
   * item totals are reconciled against the new value and `amount` /
   * `original_amount` are persisted.
   */
  amount?: number;
}

/**
 * Refund (if categorized) then delete an sms_transactions row. Shared by
 * deleteSmsTransaction and reportSmsMistake. Returns the deleted row (or null if
 * it didn't exist) so callers can log/derive labels from it. No-op if missing.
 */
async function refundAndDeleteTxn(
  supabase: Supa,
  userId: string,
  txnId: string,
): Promise<Record<string, unknown> | null> {
  const { data: txn } = await supabase
    .from("sms_transactions")
    .select("*")
    .eq("id", txnId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!txn) return null;

  if (txn.status === "categorized" && txn.budget_item_id && typeof txn.amount === "number" && txn.amount > 0) {
    try {
      await reverseSpend(txn.budget_item_id, txn.amount, {
        kind: "sms",
        merchant: txn.merchant_raw || txn.merchant_normalized || null,
      });
    } catch {
      // Budget item gone or cascade failed — still remove the txn row.
    }
  }

  const { error } = await supabase
    .from("sms_transactions")
    .delete()
    .eq("id", txnId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  return txn as Record<string, unknown>;
}

/** Delete an SMS txn. If categorized, refund its amount to the budget item first. */
export async function deleteSmsTransaction(txnId: string) {
  const { supabase, user } = await getAuthed();

  const txn = await refundAndDeleteTxn(supabase, user.id, txnId);
  if (!txn) return { ok: true as const };

  const cur = await getUserCurrency(supabase, user.id);
  const amount = txn.amount as number | null;
  const merchant =
    (txn.label as string | null) ||
    (txn.merchant_raw as string | null) ||
    (txn.merchant_normalized as string | null) ||
    "Unknown";
  await logActivity(supabase, user.id, {
    action_type: "sms_txn_deleted",
    category: "budget",
    title: `Deleted SMS transaction${typeof amount === "number" ? ` ${fmt(amount, cur)}` : ""}`,
    description: `Removed transaction at ${merchant}`,
    metadata: { txnId, merchant, amount, wasCategorized: txn.status === "categorized" },
  });

  return { ok: true as const };
}

export interface ReportSmsMistakeInput {
  txnId: string;
  /** One-way hash of the SMS template to block (sender + masked skeleton). */
  templateKey: string;
  /** Optional human-readable sample (e.g. merchant) for the blocklist UI. */
  sampleLabel?: string | null;
}

/**
 * "Report wrong SMS": record the SMS *template* in the user's blocklist (so
 * future SMS of the same kind are skipped at ingest), then refund + delete the
 * wrongly-captured transaction. Idempotent on the unique(user_id, template_key)
 * constraint — re-reporting the same template silently no-ops the upsert.
 */
export async function reportSmsMistake(input: ReportSmsMistakeInput) {
  const { supabase, user } = await getAuthed();

  // Blocklist the template (idempotent — ignore the unique-constraint conflict).
  const { error: blockErr } = await supabase
    .from("sms_blocklist")
    .upsert(
      {
        user_id: user.id,
        template_key: input.templateKey,
        sample_label: input.sampleLabel ?? null,
      },
      { onConflict: "user_id,template_key", ignoreDuplicates: true },
    );
  if (blockErr) throw new Error(blockErr.message);

  // Refund (if categorized) + delete the offending transaction.
  const txn = await refundAndDeleteTxn(supabase, user.id, input.txnId);

  const cur = await getUserCurrency(supabase, user.id);
  const amount = (txn?.amount as number | null) ?? null;
  const merchant =
    (txn?.label as string | null) ||
    (txn?.merchant_raw as string | null) ||
    (txn?.merchant_normalized as string | null) ||
    input.sampleLabel ||
    "Unknown";
  await logActivity(supabase, user.id, {
    action_type: "sms_txn_reported",
    category: "budget",
    title: `Reported wrong SMS${typeof amount === "number" ? ` ${fmt(amount, cur)}` : ""}`,
    description: `Blocked this kind of SMS and removed it (at ${merchant})`,
    metadata: {
      txnId: input.txnId,
      templateKey: input.templateKey,
      merchant,
      amount,
    },
  });

  return { ok: true as const };
}

/** Reverse a categorized txn's spend and move it back to pending. */
export async function unallocateSmsTransaction(txnId: string) {
  const { supabase, user } = await getAuthed();

  const { data: txn } = await supabase
    .from("sms_transactions")
    .select("*")
    .eq("id", txnId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!txn) throw new Error("Transaction not found");
  if (txn.status !== "categorized") return { ok: true as const, already: true as const };

  if (txn.budget_item_id && typeof txn.amount === "number" && txn.amount > 0) {
    await reverseSpend(txn.budget_item_id, txn.amount, {
      kind: "sms",
      merchant: txn.merchant_raw || txn.merchant_normalized || null,
    });
  }

  const { error } = await supabase
    .from("sms_transactions")
    .update({ status: "pending", budget_item_id: null, matched_rule_id: null })
    .eq("id", txnId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, {
    action_type: "sms_txn_unallocated",
    category: "budget",
    title: `Unallocated SMS transaction`,
    description: `Transaction returned to pending`,
    metadata: { txnId, amount: txn.amount },
  });

  return { ok: true as const };
}

/** Move a categorized txn to a different budget item (reverse old, apply new). */
export async function recategorizeSmsTransaction(input: RecategorizeSmsInput) {
  const { supabase, user } = await getAuthed();

  const { data: txn } = await supabase
    .from("sms_transactions")
    .select("*")
    .eq("id", input.txnId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!txn) throw new Error("Transaction not found");
  if (txn.status !== "categorized" || !txn.budget_item_id)
    throw new Error("Transaction is not allocated");

  const sameItem = input.newBudgetItemId === txn.budget_item_id;
  const oldAmount = typeof txn.amount === "number" ? txn.amount : 0;
  const edited = isAmountEdited(oldAmount, input.amount);
  const newAmount = effectiveAmount(oldAmount, input.amount) as number;
  const originalAmount = nextOriginalAmount(
    oldAmount,
    txn.original_amount,
    input.amount,
  );
  const merchant = txn.merchant_raw || txn.merchant_normalized || null;

  if (!sameItem && oldAmount > 0) {
    // Moving: reverse the OLD amount off the old item, apply the (possibly
    // edited) NEW amount to the new item. Reverse first to avoid a transient
    // double-count.
    await reverseSpend(txn.budget_item_id, oldAmount, { kind: "sms", merchant });
    if (newAmount > 0)
      await quickLogSpend(input.newBudgetItemId, newAmount, { kind: "sms", merchant });
  } else if (sameItem && edited) {
    // Same item, amount changed: apply only the delta (new - old).
    const delta = newAmount - oldAmount;
    if (delta > 0)
      await quickLogSpend(txn.budget_item_id, delta, { kind: "sms", merchant });
    else if (delta < 0)
      await reverseSpend(txn.budget_item_id, -delta, { kind: "sms", merchant });
  }

  const { error } = await supabase
    .from("sms_transactions")
    .update({
      budget_item_id: input.newBudgetItemId,
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(edited ? { amount: newAmount, original_amount: originalAmount } : {}),
    })
    .eq("id", input.txnId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  const cur = await getUserCurrency(supabase, user.id);
  await logActivity(supabase, user.id, {
    action_type: "sms_txn_recategorized",
    category: "budget",
    title: sameItem ? `Renamed SMS transaction` : `Re-allocated SMS transaction`,
    description: sameItem
      ? `Transaction renamed`
      : `Moved ${typeof txn.amount === "number" ? fmt(txn.amount, cur) : "transaction"} to another budget item`,
    metadata: { txnId: input.txnId, newBudgetItemId: input.newBudgetItemId, amount: txn.amount },
  });

  return { ok: true as const };
}

/** Dismiss a pending SMS txn without logging a spend. */
export async function ignoreSmsTransaction(txnId: string) {
  const { supabase, user } = await getAuthed();
  const { error } = await supabase
    .from("sms_transactions")
    .update({ status: "ignored" })
    .eq("id", txnId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Warn (web push) when the budget item — or its category — crosses 90%/100%. */
async function notifyIfNearLimit(
  supabase: Supa,
  userId: string,
  budgetItemId: string,
  currency: string,
): Promise<void> {
  const { data: item } = await supabase
    .from("budget_items")
    .select("name, planned_amount, actual_amount, category_id")
    .eq("id", budgetItemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!item) return;

  // Item-level: actual vs planned (what the spend was allocated against).
  const planned = Number(item.planned_amount);
  const actual = Number(item.actual_amount);
  if (planned > 0 && actual / planned >= NEAR_LIMIT_RATIO) {
    await sendNearLimitPush(userId, item.name, actual, planned, currency);
    return;
  }

  // Category-level fallback: total spent vs allocated.
  const { data: category } = await supabase
    .from("categories")
    .select("id, name, allocated_amount")
    .eq("id", item.category_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!category) return;
  const allocated = Number(category.allocated_amount);
  if (!(allocated > 0)) return;

  const { data: items } = await supabase
    .from("budget_items")
    .select("actual_amount")
    .eq("category_id", category.id)
    .eq("user_id", userId);
  const spent = (items ?? []).reduce((s, r) => s + Number(r.actual_amount), 0);
  if (spent / allocated < NEAR_LIMIT_RATIO) return;
  await sendNearLimitPush(userId, category.name, spent, allocated, currency);
}

async function sendNearLimitPush(
  userId: string,
  name: string,
  used: number,
  total: number,
  currency: string,
): Promise<void> {
  const over = used >= total;
  const remaining = Math.max(0, total - used);
  await notifyUser(userId, {
    title: over ? "🙀 Budget blown!" : "😼 Budget's getting thin",
    body: over
      ? `${name} is over by ${fmt(used - total, currency)}. The cat's out of the bag.`
      : `${name} at ${Math.round((used / total) * 100)}% — only ${fmt(remaining, currency)} left. Tread softly.`,
    tag: `budget-warn-${name}`,
    url: "/budget",
  });
}

// Note: SMS parsing is 100% on-device (lib/ai/parseSmsTransaction.ts). The former
// OpenRouter LLM fallback was removed so no SMS content is ever sent to a third
// party — required for the Play "SMS-based money management" data-use policy.
