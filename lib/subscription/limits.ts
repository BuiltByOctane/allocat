/**
 * Free-tier limits and helpers. Premium (paid or in-trial) is always unlimited.
 *
 * Numbers are intentionally generous so a casual user is never blocked, but a
 * committed user (several goals, a growing asset list, multiple debts, or wanting
 * deeper history) keeps bumping the ceiling — the upgrade pull. SMS auto-tracking
 * is the core feature and is NEVER gated, so it has no entry here.
 */

export const PRICING = {
  monthly: { amount: 79, currency: "INR", label: "₹79", period: "month" },
  yearly: { amount: 699, currency: "INR", label: "₹699", period: "year" },
} as const;

export const TRIAL_DAYS = 40;

export const FREE_LIMITS = {
  goals: 3,
  assets: 5,
  debts: 2,
  /** Free users see reports/activity only this many months back. */
  historyMonths: 3,
  /** AI chat & insights are premium-only. */
  ai: false,
} as const;

export type Tier = "premium" | "free";
export type CountLimitKind = "goals" | "assets" | "debts";

/**
 * True when a free user is already at (or past) the cap for `kind`, so creating
 * one more should trigger the paywall. Premium is never limited.
 */
export function isAtLimit(
  kind: CountLimitKind,
  currentCount: number,
  tier: Tier,
): boolean {
  if (tier === "premium") return false;
  return currentCount >= FREE_LIMITS[kind];
}

/**
 * The earliest date a free user may view in history/reports, or null for premium
 * (no clipping). Free users only see the last `FREE_LIMITS.historyMonths` months.
 */
export function freeHistoryCutoff(tier: Tier, now: Date = new Date()): Date | null {
  if (tier === "premium") return null;
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - FREE_LIMITS.historyMonths);
  return cutoff;
}
