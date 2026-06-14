import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { getDB } from "@/lib/db";
import { PROFILE_KEY } from "@/lib/hooks/useProfile";
import { startTrial } from "@/lib/actions/subscription";
import { getDeviceId } from "@/lib/native/deviceId";
import { purchase, syncEntitlementToServer } from "@/lib/native/adapty";

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
 * client-side; on success the Adapty webhook flips entitlement server-side and we
 * also push a belt-and-suspenders sync + invalidate the profile. Web has no buy
 * button (purchases happen in the Android app), so this no-ops there.
 */
export function useStartCheckout() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (plan: "monthly" | "yearly") => {
      if (!Capacitor.isNativePlatform()) return { ok: false as const };
      const ok = await purchase(plan);
      if (ok) await syncEntitlementToServer();
      return { ok };
    },
    onSuccess: (res) => {
      if (res.ok) qc.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });
}
