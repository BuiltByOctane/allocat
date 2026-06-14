/**
 * Pure entitlement logic — the single source of truth for "is this user premium?"
 *
 * Reads the subscription/trial columns off a `profiles` row (synced from Supabase
 * into IDB) and derives a flat entitlement object the rest of the app consumes via
 * `useEntitlement()`. Kept side-effect free so it can run identically on the client
 * (gating UI) and the server (e.g. the AI route guard) and be unit-tested.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionStatus = "trial" | "active" | "expired";

/** The subset of a `profiles` row this module needs. */
export interface EntitlementProfile {
  subscription_status: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_expires_at: string | null;
}

export interface Entitlement {
  /** The gate every feature checks. */
  tier: "premium" | "free";
  /** Premium because of a paid, unexpired subscription. */
  isPaid: boolean;
  /** Premium because of an in-progress free trial. */
  inTrial: boolean;
  /** When the trial ends (or ended), if one was ever started. */
  trialEndsAt: Date | null;
  /** Whole days remaining in the trial (ceil), or null when not in trial. */
  daysLeft: number | null;
  /** True once a trial has been started — a user gets exactly one, ever. */
  hasUsedTrial: boolean;
}

function parse(date: string | null): Date | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getEntitlement(
  profile: EntitlementProfile | null | undefined,
  now: Date = new Date(),
): Entitlement {
  if (!profile) {
    return {
      tier: "free",
      isPaid: false,
      inTrial: false,
      trialEndsAt: null,
      daysLeft: null,
      hasUsedTrial: false,
    };
  }

  const trialEndsAt = parse(profile.trial_ends_at);
  const subExpires = parse(profile.subscription_expires_at);
  const hasUsedTrial = profile.trial_started_at != null;

  const isPaid =
    profile.subscription_status === "active" &&
    (subExpires === null || subExpires.getTime() > now.getTime());

  const inTrial =
    profile.subscription_status === "trial" &&
    trialEndsAt !== null &&
    now.getTime() < trialEndsAt.getTime();

  const daysLeft =
    inTrial && trialEndsAt
      ? Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS)
      : null;

  return {
    tier: isPaid || inTrial ? "premium" : "free",
    isPaid,
    inTrial,
    trialEndsAt,
    daysLeft,
    hasUsedTrial,
  };
}
