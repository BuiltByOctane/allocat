/**
 * Pure merchant-matching + dedupe helpers shared by the SMS ingestion pipeline.
 * A `merchant_rules` row maps a normalized merchant pattern to a budget item so
 * that repeat transactions auto-categorize without bothering the user.
 */

export type MerchantMatchType = "exact" | "contains" | "regex";

export interface MerchantRule {
  id: string;
  match_type: MerchantMatchType;
  /** For exact/contains: compared against the normalized merchant. For regex: a raw pattern. */
  pattern: string;
  /**
   * Durable cross-month identity: the template + template-item the rule targets.
   * Resolved to the current month's `budget_item_id` at apply time. Null on legacy
   * rules and rules learned against manual (non-template) budgets.
   */
  template_id?: string | null;
  template_item_id?: string | null;
  /**
   * Denormalized cache of the last-resolved budget item. No longer the durable
   * key — kept for legacy same-month fallback and native display. May be null.
   */
  budget_item_id?: string | null;
  category_id?: string | null;
  auto_apply: boolean;
  /** Present on persisted rules; used for usage stats, not for matching. */
  times_applied?: number;
}

/** Canonical key for a merchant string: handle-stripped, lowercased, de-punctuated. */
export function normalizeMerchant(raw: string): string {
  const beforeHandle = raw.split("@")[0];
  return beforeHandle
    .toLowerCase()
    .replace(/[^a-z0-9 &]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TIER_ORDER: MerchantMatchType[] = ["exact", "contains", "regex"];

/**
 * All rules matching `merchant`, ordered by precedence (exact > contains >
 * regex, then array order within a tier). The caller picks the first that
 * actually resolves to a live item — important when stale/duplicate rules exist
 * for the same merchant (e.g. an old rule whose template item was deleted must
 * not shadow a newer working one). See selectRuleForPeriod in resolveRuleItem.ts.
 */
export function matchMerchantRules(
  merchant: string,
  rules: MerchantRule[],
): MerchantRule[] {
  const norm = normalizeMerchant(merchant);
  const out: MerchantRule[] = [];
  for (const tier of TIER_ORDER) {
    for (const rule of rules) {
      if (rule.match_type !== tier) continue;
      if (ruleMatches(rule, norm)) out.push(rule);
    }
  }
  return out;
}

/** Find the single best rule matching `merchant` (exact > contains > regex). */
export function matchMerchantRule(
  merchant: string,
  rules: MerchantRule[],
): MerchantRule | null {
  return matchMerchantRules(merchant, rules)[0] ?? null;
}

function ruleMatches(rule: MerchantRule, normalizedMerchant: string): boolean {
  switch (rule.match_type) {
    case "exact":
      return normalizeMerchant(rule.pattern) === normalizedMerchant;
    case "contains": {
      const p = normalizeMerchant(rule.pattern);
      return p.length > 0 && normalizedMerchant.includes(p);
    }
    case "regex":
      try {
        return new RegExp(rule.pattern, "i").test(normalizedMerchant);
      } catch {
        return false;
      }
  }
}

/**
 * Stable dedupe key for an incoming SMS. Re-deliveries of the identical message
 * collapse to the same key; genuinely distinct transactions (different ref no.)
 * differ. Store with a unique index to drop duplicates.
 *
 * The key is a one-way HASH of sender + body, not the plaintext: this key is the
 * only SMS-derived value synced to the server, so hashing keeps the raw message
 * content on-device (Play "SMS-based money management" data-minimization).
 */
export function txnDedupeKey(p: { sender?: string | null; raw: string }): string {
  const sender = (p.sender ?? "").toLowerCase().trim();
  const body = p.raw.toLowerCase().replace(/\s+/g, " ").trim();
  return hash53(`${sender}|${body}`);
}

/**
 * Stable "template" key for an SMS — identifies the *kind* of message rather
 * than the specific transaction. Two instances of the same bank template
 * (different amounts / dates / ref numbers / payees) collapse to the same key,
 * so a user who reports one wrongly-captured message can have that whole
 * template skipped in future.
 *
 * Built by masking the variable parts (digits, currency amounts, masked account
 * tails, UPI handles) while keeping the alphabetic words — so a credit template
 * never collides with the same bank's debit template (the verb differs). Like
 * `txnDedupeKey`, the result is a one-way HASH of sender + skeleton, so the raw
 * SMS content stays on-device and only the hash is ever synced.
 *
 * NOTE: kept in sync with the Java port in SmsSignature.java (native closed-app
 * path) — change both together.
 */
export function smsTemplateKey(p: { sender?: string | null; raw: string }): string {
  const sender = (p.sender ?? "").toLowerCase().trim();
  const skeleton = smsSkeleton(p.raw);
  return hash53(`${sender}|${skeleton}`);
}

/** Mask the variable parts of an SMS body, leaving the structural skeleton. */
function smsSkeleton(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b[\w.\-]+@[\w.\-]+\b/g, "@") // UPI / VPA handles
    .replace(/[*x]{1,}\d+/g, "#") // masked account tails: **1234, xx12
    .replace(/[\d,]*\d/g, "#") // any number run (amounts, dates, refs)
    .replace(/#(?:[.\-/:]#)+/g, "#") // collapse number groups like #-#-# (dates)
    .replace(/#+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * cyrb53 — fast, well-distributed 53-bit string hash. Deterministic across
 * runs/devices, not reversible to the original SMS. Returned as a hex string.
 */
function hash53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, "0");
}
