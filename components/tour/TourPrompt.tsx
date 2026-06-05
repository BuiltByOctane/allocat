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
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/98 p-6 backdrop-blur-sm">
      <div className="w-full max-w-[360px] border border-border bg-card p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border">
          <MaterialSymbol icon="map" className="text-foreground" />
        </div>
        <h1 className="text-lg font-bold uppercase tracking-widest">
          Take a quick tour?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We can walk you through the dashboard, budgets, goals and more. It only
          takes a minute — or skip it and explore on your own.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => tour.answerPrompt(true)}
            className="w-full bg-foreground py-3 text-xs font-bold uppercase tracking-widest text-background"
          >
            Yes, show me around
          </button>
          <button
            type="button"
            onClick={() => tour.answerPrompt(false)}
            className="w-full border border-border py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
