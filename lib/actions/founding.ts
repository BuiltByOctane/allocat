"use server";

import { getAuthedUser } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getServerFlags } from "@/lib/config/serverFlags";

export type FoundingPlatform = "web" | "pwa" | "android";

export type ClaimFoundingResult =
  | { ok: true; since: string }
  | { error: "unauthenticated" | "closed" | "failed" };

const PLATFORMS = new Set<FoundingPlatform>(["web", "pwa", "android"]);

/**
 * Claim a founding-member spot (locks founding pricing for when Premium
 * launches). Nothing is bought or unlocked — AlloCat stays free.
 *
 * Called directly, not through the sync queue: a queued claim could land after
 * the offer was closed. The `founding_offer_open` flag is enforced here, server
 * side. Idempotent — a second claim returns the original date.
 *
 * `founding_members` is service-role only (no RLS policies), so the write goes
 * through the service client after the caller is authenticated.
 */
export async function claimFoundingSpot(platform: FoundingPlatform): Promise<ClaimFoundingResult> {
  const user = await getAuthedUser();
  if (!user) return { error: "unauthenticated" };

  const service = createServiceClient();

  const { data: existing } = await service
    .from("founding_members")
    .select("claimed_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return { ok: true, since: existing.claimed_at };

  const flags = await getServerFlags();
  if (!flags.founding_offer_open) return { error: "closed" };

  const { data: profile } = await service
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .maybeSingle();
  const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();
  if (!email) return { error: "failed" };

  const since = new Date().toISOString();
  const { error: insertErr } = await service.from("founding_members").upsert(
    {
      user_id: user.id,
      email,
      source: "app",
      platform: PLATFORMS.has(platform) ? platform : null,
      claimed_at: since,
    },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  if (insertErr) return { error: "failed" };

  const { error: profileErr } = await service
    .from("profiles")
    .update({ founding_member_since: since })
    .eq("id", user.id)
    .is("founding_member_since", null);
  if (profileErr) return { error: "failed" };

  return { ok: true, since };
}
