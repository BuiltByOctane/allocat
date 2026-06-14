"use server";

import { createClient } from "@/lib/supabase/server";
import { getEntitlement } from "@/lib/subscription/entitlement";
import { TRIAL_DAYS } from "@/lib/subscription/limits";

const DAY_MS = 24 * 60 * 60 * 1000;

type TrialFields = {
  subscription_status: "trial";
  trial_started_at: string;
  trial_ends_at: string;
};

/**
 * Opt-in start of the 40-day free trial. Idempotent: a user gets exactly one
 * trial ever, so if `trial_started_at` is already set we no-op and return the
 * existing fields. `deviceId` is recorded as a secondary abuse signal.
 *
 * Returns the trial fields so the client can patch its IDB profile row
 * optimistically (profiles are not part of the sync queue).
 */
export async function startTrial(
  deviceId?: string | null,
): Promise<{ error: string } | { success: true; fields: TrialFields }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile, error: readErr } = await supabase
    .from("profiles")
    .select(
      "subscription_status, trial_started_at, trial_ends_at, subscription_expires_at",
    )
    .eq("id", user.id)
    .single();

  if (readErr) return { error: readErr.message };

  // Already started a trial (or are paid) — don't reset it.
  if (profile?.trial_started_at) {
    return {
      success: true,
      fields: {
        subscription_status: "trial",
        trial_started_at: profile.trial_started_at,
        trial_ends_at: profile.trial_ends_at as string,
      },
    };
  }

  const now = new Date();
  const fields: TrialFields = {
    subscription_status: "trial",
    trial_started_at: now.toISOString(),
    trial_ends_at: new Date(now.getTime() + TRIAL_DAYS * DAY_MS).toISOString(),
  };

  const { error } = await supabase
    .from("profiles")
    .update({ ...fields, trial_device_id: deviceId ?? null })
    .eq("id", user.id);

  if (error) return { error: error.message };

  return { success: true, fields };
}

/**
 * Server-side entitlement check for guarding sensitive endpoints (e.g. the AI
 * route). Reads the current user's profile and derives the entitlement so the
 * gate can't be bypassed by a tampered client.
 */
export async function getServerEntitlement() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return getEntitlement(null);

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "subscription_status, trial_started_at, trial_ends_at, subscription_expires_at",
    )
    .eq("id", user.id)
    .single();

  return getEntitlement(profile ?? null);
}
