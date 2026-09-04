"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { syncSupporterStatus } from "@/lib/actions/support";
import { markSupporterLocally } from "@/lib/support/local";
import { PROFILE_KEY } from "@/lib/hooks/useProfile";

const SESSION_KEY = "allocat-supporter-checked";

/**
 * Reconciles a Ko-fi donation with this account once per session.
 *
 * The webhook links donations to existing profiles on its own; this covers the
 * donate-first-sign-up-later order, and gives the "I already supported" path on
 * the support page something to converge on. Silent and best-effort — a failure
 * just means the badge shows up next session.
 */
export function SupporterSync() {
  const qc = useQueryClient();

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, "1");

    let cancelled = false;
    (async () => {
      try {
        const { isSupporter } = await syncSupporterStatus();
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
