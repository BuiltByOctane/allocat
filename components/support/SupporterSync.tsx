"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { syncSupporterStatus } from "@/lib/actions/support";
import { markSupporterLocally } from "@/lib/support/local";
import { PROFILE_KEY } from "@/lib/hooks/useProfile";

const DAY_KEY = "allocat-supporter-checked-day";

/** Local (not UTC) day stamp — matches how a user thinks about "today". */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Reconciles a Ko-fi donation with this account at most once per day.
 *
 * The webhook links donations to existing profiles on its own; this covers the
 * donate-first-sign-up-later order, and gives the "I already supported" path on
 * the support page something to converge on. That button (SupportPage) calls
 * the same action directly, so a donation made right now is never gated behind
 * this timer. Silent and best-effort — a failure just means the badge shows up
 * on a later launch.
 *
 * Day-gated rather than per-session: every cold launch used to spend a server
 * action (plus its auth round trip) on a check that changes at most once in a
 * user's lifetime.
 */
export function SupporterSync() {
  const qc = useQueryClient();

  useEffect(() => {
    try {
      if (localStorage.getItem(DAY_KEY) === today()) return;
    } catch {
      // Storage blocked (private mode) — fall through and just run the check.
    }

    let cancelled = false;
    (async () => {
      try {
        const { isSupporter } = await syncSupporterStatus();
        // Stamp only on success, so an offline launch retries later.
        try {
          localStorage.setItem(DAY_KEY, today());
        } catch {}
        if (cancelled || !isSupporter) return;
        await markSupporterLocally();
        qc.invalidateQueries({ queryKey: PROFILE_KEY });
      } catch {
        // Offline or transient — retried next session.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [qc]);

  return null;
}

export default SupporterSync;
