"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyUser } from "@/lib/server/push-notify";
import { DEFAULT_FLAGS, parseFlags, type AppFlags } from "@/lib/config/flags";
import { invalidateServerFlags } from "@/lib/config/serverFlags";
import type { Json } from "@/lib/types/database";

/**
 * Write side of the admin portal.
 *
 * Every action re-runs `requireAdmin()`. A server action is independently
 * addressable over the network — the layout's guard does not protect it, and
 * treating it as if it did is the classic way these portals get owned.
 */

type Result = { ok: true } | { error: string };

/* ── Feedback inbox ──────────────────────────────────────────────────────── */

export async function setFeedbackResolved(id: string, resolved: boolean): Promise<Result> {
  await requireAdmin();
  const service = createServiceClient();
  const { error } = await service
    .from("feedback")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/support");
  revalidatePath("/admin");
  return { ok: true };
}

/* ── Supporter ledger ────────────────────────────────────────────────────── */

/**
 * Attach an orphan donation to an account.
 *
 * Ko-fi only gives us the donor's email. When that address never becomes an
 * account (typo, different address, PayPal alias) the row sits unlinked; this
 * is the manual escape hatch. Mirrors syncSupporterStatus() in
 * lib/actions/support.ts, which does the same thing automatically when the
 * addresses happen to match.
 */
export async function linkSupporterToUser(email: string, userId: string): Promise<Result> {
  await requireAdmin();
  const service = createServiceClient();

  const { data: donor, error: donorErr } = await service
    .from("supporters")
    .select("email, first_supported_at")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (donorErr) return { error: donorErr.message };
  if (!donor) return { error: `No supporters row for ${email}` };

  const { error: linkErr } = await service
    .from("supporters")
    .update({ user_id: userId })
    .eq("email", donor.email);
  if (linkErr) return { error: linkErr.message };

  const { error: flagErr } = await service
    .from("profiles")
    .update({
      is_supporter: true,
      supporter_since: donor.first_supported_at ?? new Date().toISOString(),
    })
    .eq("id", userId);
  if (flagErr) return { error: flagErr.message };

  revalidatePath("/admin/support");
  return { ok: true };
}

/**
 * Flip the cosmetic supporter badge by hand.
 *
 * The badge is decorative only (see CLAUDE.md) — nothing is gated on it, so
 * this is safe to toggle and can never amount to selling digital content.
 */
export async function setSupporterFlag(userId: string, isSupporter: boolean): Promise<Result> {
  await requireAdmin();
  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({
      is_supporter: isSupporter,
      supporter_since: isSupporter ? new Date().toISOString() : null,
    })
    .eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/support");
  return { ok: true };
}

/* ── User operations ─────────────────────────────────────────────────────── */

export async function sendTestPushTo(userId: string): Promise<Result> {
  await requireAdmin();
  try {
    const res = await notifyUser(userId, {
      title: "AlloCat",
      body: "Test notification from the admin portal.",
      tag: "admin-test",
      url: "/dashboard",
    });
    // notifyUser never throws on a non-delivery — surface the real reason
    // instead of a green tick over nothing.
    if (res.skipped === "vapid_unconfigured") {
      return { error: "VAPID keys are not configured on this deploy." };
    }
    if (res.skipped === "no_subscriptions") {
      return {
        error:
          "This user has no push subscription. Web push only reaches browsers/PWAs that granted permission — never the Android shell.",
      };
    }
    if (res.sent === 0) {
      return { error: `Delivered to 0 of ${res.subscriptions} device(s).` };
    }
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Push failed" };
  }
}

/** Revoke every session for a user — the fix when someone is stuck in a bad auth state. */
export async function forceSignOutUser(userId: string): Promise<Result> {
  await requireAdmin();
  const service = createServiceClient();
  const { error } = await service.auth.admin.signOut(userId);
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Delete an account and everything it owns.
 *
 * Same mechanism as the user-facing deleteAccount() in lib/actions/auth.ts:
 * removing the auth user cascades through every public table (all have
 * `user_id references auth.users(id) on delete cascade`). Irreversible.
 *
 * `confirmEmail` must match the account's own email — the UI makes the admin
 * type it, so a misclick on the wrong row cannot delete anyone.
 */
export async function deleteUserAccount(userId: string, confirmEmail: string): Promise<Result> {
  const admin = await requireAdmin();
  const service = createServiceClient();

  const { data: profile, error: readErr } = await service
    .from("profiles")
    .select("id, email")
    .eq("id", userId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!profile) return { error: "No such user." };

  if ((profile.email ?? "").trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
    return { error: "Confirmation email does not match this account." };
  }
  if (profile.id === admin.id) {
    return { error: "Refusing to delete the account you are signed in as." };
  }

  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true };
}

/* ── Runtime config ──────────────────────────────────────────────────────── */

/**
 * Write the singleton `app_config` row.
 *
 * `app_config` has a public READ policy and no write policy, so this must go
 * through the service client — same reason the force-update version was
 * previously bumped by hand in the Supabase SQL editor.
 */
export async function saveAppConfig(input: {
  minAndroidVersionCode: number;
  updateMessage: string | null;
  flags: Partial<AppFlags>;
}): Promise<Result> {
  await requireAdmin();
  const service = createServiceClient();

  const { error } = await service
    .from("app_config")
    .update({
      min_android_version_code: Math.max(0, Math.floor(input.minAndroidVersionCode || 0)),
      update_message: input.updateMessage?.trim() || null,
      // Round-trip through parseFlags so a malformed value can never be stored.
      flags: parseFlags({ ...DEFAULT_FLAGS, ...input.flags }) as unknown as Json,
    })
    .eq("id", 1);

  if (error) return { error: error.message };

  // Only clears this instance's memo, but makes a flip visible immediately when
  // testing locally; other instances pick it up within the 60s TTL.
  invalidateServerFlags();
  revalidatePath("/admin/config");
  return { ok: true };
}

/* ── Play Store ──────────────────────────────────────────────────────────── */

/**
 * Pull the Play bulk-report CSVs on demand.
 *
 * Same work the nightly cron does; this is the path that needs no CRON_SECRET
 * and the fallback if the deploy target has no scheduler.
 */
export async function syncPlayInstallsNow(): Promise<
  { ok: true; rows: number } | { error: string }
> {
  await requireAdmin();
  try {
    const { syncPlayInstalls } = await import("@/lib/play/installs");
    const res = await syncPlayInstalls();
    revalidatePath("/admin/growth");
    revalidatePath("/admin");
    return { ok: true, rows: res.rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Sync failed" };
  }
}
