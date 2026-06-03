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
  budget_item_id: string;
  category_id: string;
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

/** Find the rule that matches `merchant`, preferring exact > contains > regex. */
export function matchMerchantRule(
  merchant: string,
  rules: MerchantRule[],
): MerchantRule | null {
  const norm = normalizeMerchant(merchant);
  for (const tier of TIER_ORDER) {
    for (const rule of rules) {
      if (rule.match_type !== tier) continue;
      if (ruleMatches(rule, norm)) return rule;
    }
  }
  return null;
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
 */
export function txnDedupeKey(p: { sender?: string | null; raw: string }): string {
  const sender = (p.sender ?? "").toLowerCase().trim();
  const body = p.raw.toLowerCase().replace(/\s+/g, " ").trim();
  return `${sender}|${body}`;
}
