/**
 * Cross-month resolution of a matched `merchant_rules` row to the budget item it
 * should charge *for a given period*. This is the single source of truth shared
 * by the server ingest path (`lib/actions/sms.ts`) and the client ingest path
 * (`lib/sms/ingestClient.ts`) so the two can never diverge.
 *
 * Why this exists: budget items get fresh UUIDs every month a template is
 * applied, so a rule can't store a raw `budget_item_id` and expect it to stay
 * valid. Instead a durable rule stores `(template_id, template_item_id)` and we
 * resolve it against *this* month's budget at apply time.
 *
 * See `docs/sms-feature.md` and the cross-month design notes.
 */

import type { MerchantRule } from "./match";

/** The budget item shape the resolver needs (subset of a budget_items row). */
export interface ResolverItem {
  id: string;
  template_id: string | null;
  template_item_id: string | null;
}

/** Pre-fetched context for one period (month/year), gathered by each caller. */
export interface RuleResolutionContext {
  /** The budget row for the target period, or null if none exists yet. */
  budget: { id: string; template_id: string | null } | null;
  /** Budget items in that budget. */
  items: ResolverItem[];
}

type ResolvableRule = Pick<
  MerchantRule,
  "template_id" | "template_item_id" | "budget_item_id"
>;

/**
 * Map a matched rule to the budget_item id to charge for the period described by
 * `ctx`, or null when it can't durably resolve.
 *
 * Returns null (→ caller leaves the SMS pending for manual allocation) when:
 * - the period has no budget yet,
 * - the budget came from a different template than the rule,
 * - the rule's template item is absent from this budget (removed in an edit),
 * - the durable identity is ambiguous (duplicate template_item_id), or
 * - a legacy rule's cached item is not in this budget (i.e. another month).
 */
export function resolveRuleItemId(
  rule: ResolvableRule,
  ctx: RuleResolutionContext,
): string | null {
  // Legacy rule (no durable key): only safe when its cached item is in THIS
  // budget — preserves today's same-month behaviour without ever charging a
  // stale item from another month.
  if (!rule.template_id || !rule.template_item_id) {
    if (!rule.budget_item_id) return null;
    return ctx.items.some((i) => i.id === rule.budget_item_id)
      ? rule.budget_item_id
      : null;
  }

  if (!ctx.budget || ctx.budget.template_id !== rule.template_id) return null;

  const matches = ctx.items.filter(
    (i) =>
      i.template_id === rule.template_id &&
      i.template_item_id === rule.template_item_id,
  );
  // Exactly one match is required; duplicates are ambiguous → stay pending.
  return matches.length === 1 ? matches[0].id : null;
}

/**
 * Pick the rule to auto-apply from an ordered list of merchant matches: the
 * first auto-apply rule that resolves to a live item this period. Skips stale
 * rules (template item deleted) and non-auto rules, so an old broken rule can
 * never shadow a newer working one for the same merchant. Returns null when no
 * matching rule resolves → caller leaves the SMS pending.
 */
export function selectRuleForPeriod<
  R extends ResolvableRule & { auto_apply: boolean },
>(candidates: R[], ctx: RuleResolutionContext): { rule: R; itemId: string } | null {
  for (const rule of candidates) {
    if (!rule.auto_apply) continue;
    const itemId = resolveRuleItemId(rule, ctx);
    if (itemId) return { rule, itemId };
  }
  return null;
}
