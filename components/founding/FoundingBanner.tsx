"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Crown, X } from "lucide-react";
import { useAppFlags } from "@/lib/hooks/useAppFlags";
import { useClaimFounding, useIsFoundingMember } from "@/lib/hooks/useFoundingMember";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { track } from "@/lib/analytics/client";
import { FOUNDING_CONFIRMATION, claimErrorCopy } from "@/components/founding/copy";

const DISMISS_KEY = "allocat-founding-banner-dismissed";

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Slim dashboard row announcing Premium + the founding-member offer.
 *
 * Shown only while both `founding_offer_open` and `founding_banner_visible` are
 * on, and the user hasn't claimed. One tap claims; the row then turns into the
 * confirmation until dismissed. Dismissal is per-device (localStorage).
 */
export function FoundingBanner() {
  const flags = useAppFlags();
  const isMember = useIsFoundingMember();
  const haptic = useHaptic();
  const { state, claim } = useClaimFounding("dashboard");
  const [dismissed, setDismissed] = useState(false);

  // localStorage is client-only; server snapshot `true` keeps SSR markup empty.
  const storedDismissed = useSyncExternalStore(
    useCallback(() => () => {}, []),
    isDismissed,
    () => true,
  );

  const claimed = state === "claimed";
  if (dismissed || storedDismissed) return null;
  // Keep the confirmation visible after the claim flips `isMember`.
  if (!claimed && (isMember || !flags.founding_offer_open || !flags.founding_banner_visible)) {
    return null;
  }

  const dismiss = () => {
    haptic.light();
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    if (!claimed) track("founding_banner_dismissed", { surface: "dashboard" });
    setDismissed(true);
  };

  const onClaim = () => {
    haptic.light();
    void claim();
  };

  const error = claimErrorCopy(state);

  return (
    <div className="relative flex items-center gap-2.5 rounded-card border border-border bg-card px-3 py-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-accent/15 text-accent">
        <Crown size={15} strokeWidth={2} />
      </div>
      <p className="flex-1 min-w-0 text-[11.5px] font-semibold leading-snug text-foreground">
        {claimed ? (
          FOUNDING_CONFIRMATION
        ) : error ? (
          <span className="text-muted-foreground">{error}</span>
        ) : (
          <>
            Premium is coming.{" "}
            <Link href="/support" className="text-muted-foreground underline underline-offset-2">
              Lock founding-member pricing
            </Link>
          </>
        )}
      </p>
      {!claimed && state !== "closed" && (
        <button
          type="button"
          onClick={onClaim}
          disabled={state === "claiming"}
          className="shrink-0 rounded-pill bg-accent px-3 py-1.5 text-[11px] font-bold text-accent-ink active:scale-95 transition-transform disabled:opacity-60"
        >
          {state === "claiming" ? "…" : "Claim"}
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground active:scale-90 transition-transform"
      >
        <X size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}

export default FoundingBanner;
