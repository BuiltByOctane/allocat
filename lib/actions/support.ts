"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Reconcile a donation with the signed-in account.
 *
 * The Ko-fi webhook links a donation to a profile when one already exists for
 * that email. This covers the other order: someone donated before signing up,
 * or the webhook landed before their profile row did. Idempotent and cheap —
 * one indexed lookup, and it short-circuits once the flag is set.
 *
 * Returns whether the caller is a supporter after the check.
 */
export async function syncSupporterStatus(): Promise<{ isSupporter: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { isSupporter: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, is_supporter")
    .eq("id", user.id)
    .single();

  if (!profile) return { isSupporter: false };
  if (profile.is_supporter) return { isSupporter: true };

  const email = (profile.email ?? user.email ?? "").trim().toLowerCase();
  if (!email) return { isSupporter: false };

  // The supporters ledger is service-role only (a donor row may not be linked to
  // any account yet, so it can't be covered by a per-user RLS policy).
  const service = createServiceClient();
  const { data: donor } = await service
    .from("supporters")
    .select("email, first_supported_at")
    .eq("email", email)
    .maybeSingle();

  if (!donor) return { isSupporter: false };

  await service
    .from("profiles")
    .update({
      is_supporter: true,
      supporter_since: donor.first_supported_at ?? new Date().toISOString(),
    })
    .eq("id", profile.id);

  await service.from("supporters").update({ user_id: profile.id }).eq("email", email);

  return { isSupporter: true };
}
