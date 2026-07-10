"use client";

import { useTour } from "@/lib/tour/useTour";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";

/**
 * Upfront opt-in for the onboarding tour. Instead of auto-starting the driver.js
 * walkthrough (which could appear underneath the native "Transaction alerts"
 * setup modal), we ask once whether the user wants a tour. The page tours stay
 * gated (`asked === false`) until this is answered — and since this sits below
 * the opaque NativeSetup overlay (z-[90] < z-[100]), it only becomes reachable
 * after that modal is dismissed, so the tour can never start beneath it.
 */
export function TourPrompt() {
  const tour = useTour();

  // Wait for localStorage to load; only show to users who haven't been asked.
  if (!tour.hydrated || tour.asked) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/95 p-6 backdrop-blur-sm">
      <div className="w-full max-w-[360px] rounded-card border border-border bg-card p-6 text-center shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-accent text-[var(--accent-ink)]">
          <MaterialSymbol icon="map" style={{ fontSize: 26 }} />
        </div>
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-foreground">
          Take a quick tour?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We can walk you through the dashboard, budgets, goals and more. It only
          takes a minute - or skip it and explore on your own.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => tour.answerPrompt(true)}
            className="w-full h-[48px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold active:scale-[0.98] transition-all"
          >
            Yes, show me around
          </button>
          <button
            type="button"
            onClick={() => tour.answerPrompt(false)}
            className="w-full h-[48px] rounded-pill bg-muted text-foreground text-sm font-semibold hover:brightness-95 transition-all"
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
