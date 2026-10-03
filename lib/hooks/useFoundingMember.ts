"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile, PROFILE_KEY } from "@/lib/hooks/useProfile";
import { claimFoundingSpot } from "@/lib/actions/founding";
import { platform, track } from "@/lib/analytics/client";
import { getDB } from "@/lib/db";

/**
 * Whether the user has claimed a founding-member spot.
 *
 * Cosmetic only — draws the crown. Nothing in the app is gated on it. Reads the
 * already hydrated profile row, so no extra provider or network call.
 */
export function useIsFoundingMember(): boolean {
  const { data: profile } = useProfile();
  return !!profile?.founding_member_since;
}

/** Mirror the claim into the IDB profile row so the crown shows at once. */
async function markFoundingLocally(since: string): Promise<void> {
  const db = getDB();
  const profile = (await db.profiles.toArray())[0];
  if (!profile || profile.founding_member_since) return;
  await db.profiles.update(profile.id, { founding_member_since: since });
}

export type ClaimState = "idle" | "claiming" | "claimed" | "closed" | "offline" | "error";

/** One-tap claim. `surface` is analytics-only (where the tap happened). */
export function useClaimFounding(surface: "dashboard" | "support") {
  const qc = useQueryClient();
  const [state, setState] = useState<ClaimState>("idle");

  const claim = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setState("offline");
      return;
    }
    setState("claiming");
    try {
      const res = await claimFoundingSpot(platform());
      if ("error" in res) {
        setState(res.error === "closed" ? "closed" : "error");
        return;
      }
      await markFoundingLocally(res.since);
      await qc.invalidateQueries({ queryKey: PROFILE_KEY });
      track("founding_claimed", { surface });
      setState("claimed");
    } catch {
      // Fetch TypeError ⇒ no connection reached the server.
      setState("offline");
    }
  }, [qc, surface]);

  return { state, claim };
}
