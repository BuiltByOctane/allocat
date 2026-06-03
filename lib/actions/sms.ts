"use server";

import { createClient } from "@/lib/supabase/server";
import { quickLogSpend } from "@/lib/actions/budget";
import { notifyUser } from "@/lib/server/push-notify";
import { logActivity, getUserCurrency, fmt } from "@/lib/server/activity-logger";
import {
  normalizeMerchant,
  matchMerchantRule,
  type MerchantRule,
} from "@/lib/sms/match";

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
  raw: string;
  sender?: string | null;
  amount: number | null;
  currency?: string | null;
  merchantRaw?: string | null;
  direction?: "debit" | "credit" | null;
  /** ISO date/timestamp string. */
  occurredAt?: string | null;
  dedupeKey: string;
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
      raw_text: input.raw,
      sender: input.sender ?? null,
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
      await quickLogSpend(rule.budget_item_id, input.amount as number);
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
      title: "New transaction — allocate it",
      body: `${fmt(input.amount as number, cur)} at ${merchantLabel}`,
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

  await quickLogSpend(input.budgetItemId, txn.amount);

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
    })
    .eq("id", input.txnId)
    .eq("user_id", user.id);

  const cur = await getUserCurrency(supabase, user.id);
  await notifyIfNearLimit(supabase, user.id, input.budgetItemId, cur);

  return { ok: true, ruleCreated: Boolean(ruleId) };
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
    title: over ? "Budget exceeded" : "Budget almost gone",
    body: over
      ? `${name} is over budget by ${fmt(used - total, currency)}`
      : `${name} at ${Math.round((used / total) * 100)}% — ${fmt(remaining, currency)} left`,
    tag: `budget-warn-${name}`,
    url: "/budget",
  });
}

// ─── LLM fallback (tier 2) ─────────────────────────────────────────────────────

export interface LlmParsedTxn {
  amount: number | null;
  currency: string | null;
  merchant: string | null;
  direction: "debit" | "credit" | null;
  occurredAt: string | null;
}

/**
 * Tier-2 parser: when on-device regex confidence is low, extract fields with the
 * model. Returns null on any failure so the caller can degrade gracefully.
 */
export async function parseSmsWithLLM(raw: string): Promise<LlmParsedTxn | null> {
  await getAuthed();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;

  const prompt = [
    "Extract transaction fields from this bank/UPI SMS. Respond with ONLY a JSON",
    'object: {"amount":number|null,"currency":string|null,"merchant":string|null,',
    '"direction":"debit"|"credit"|null,"occurredAt":"YYYY-MM-DD"|null}.',
    "amount is the transaction amount (not the available balance).",
    "merchant is the payee/sender name or UPI handle. No prose, no code fences.",
    "",
    `SMS: ${raw}`,
  ].join("\n");

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://allocat.app",
        "X-Title": "AlloCat",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b:free",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as LlmParsedTxn;
    return {
      amount: typeof parsed.amount === "number" ? parsed.amount : null,
      currency: parsed.currency ?? null,
      merchant: parsed.merchant ?? null,
      direction:
        parsed.direction === "debit" || parsed.direction === "credit"
          ? parsed.direction
          : null,
      occurredAt: parsed.occurredAt ?? null,
    };
  } catch {
    return null;
  }
}
