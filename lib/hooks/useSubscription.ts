import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { getDB } from "@/lib/db";
import { PROFILE_KEY } from "@/lib/hooks/useProfile";
import { startTrial } from "@/lib/actions/subscription";
import { getDeviceId } from "@/lib/native/deviceId";
import {
  purchase,
  restorePurchases,
  type EntitlementSnapshot,
} from "@/lib/native/adapty";

/**
 * Optimistically reflect an Adapty entitlement in the local IDB profile so the
 * native UI flips immediately. The Adapty webhook is the authoritative writer to
 * Supabase; this is local-only for snappiness (the server value lands on the next
 * hydrate). `plan` is only known for a fresh purchase, not a restore.
 */
async function reflectEntitlementLocally(
  snap: EntitlementSnapshot,
  plan?: "monthly" | "yearly",
) {
  const db = getDB();
  const all = await db.profiles.toArray();
  const local = all[0];
  if (!local) return;
  await db.profiles.update(local.id, {
    subscription_status: snap.isActive ? "active" : "expired",
    subscription_expires_at: snap.expiresAt,
    ...(plan ? { plan } : {}),
  });
}

/**
 * Start the opt-in 40-day free trial. Calls the server action (source of truth),
 * then patches the IDB profile row optimistically and invalidates the profile
 * query so `useEntitlement()` flips to premium immediately. Idempotent server-side.
 */
export function useStartTrial() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await startTrial(getDeviceId());
      if ("error" in res) throw new Error(res.error);

      // Patch the local profile row so entitlement updates without a refetch.
      const db = getDB();
      const all = await db.profiles.toArray();
      const local = all[0];
      if (local) {
        await db.profiles.update(local.id, {
          subscription_status: res.fields.subscription_status,
          trial_started_at: res.fields.trial_started_at,
          trial_ends_at: res.fields.trial_ends_at,
        });
      }
      return res.fields;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });
}

/**
 * Begin checkout for a plan. Native (Android) runs the Adapty/Play purchase flow
 * client-side; on success we reflect entitlement locally for immediacy while the
 * signed Adapty webhook persists the authoritative server state. Web has no buy
 * button (purchases happen in the Android app), so this no-ops there.
 */
export function useStartCheckout() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (plan: "monthly" | "yearly") => {
      if (!Capacitor.isNativePlatform()) return { ok: false as const };
      const snap = await purchase(plan);
      if (snap?.isActive) await reflectEntitlementLocally(snap, plan);
      return { ok: Boolean(snap?.isActive) };
    },
    onSuccess: (res) => {
      if (res.ok) qc.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });
}

/**
 * Restore prior purchases (native only) — e.g. reinstall or new device. Reflects
 * the restored entitlement locally; the server already holds the authoritative
 * value from the original purchase webhook.
 */
export function useRestorePurchases() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!Capacitor.isNativePlatform()) return { ok: false as const };
      const snap = await restorePurchases();
      if (snap?.isActive) await reflectEntitlementLocally(snap);
      return { ok: Boolean(snap?.isActive) };
    },
    onSuccess: (res) => {
      if (res.ok) qc.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });
}
