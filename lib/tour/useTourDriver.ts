"use client";

import { useEffect, useRef } from "react";
import { useTour } from "./useTour";
import { TOUR_STEPS } from "./tourSteps";
import type { TourPage } from "./types";

export function useTourDriver(page: TourPage) {
  const tour = useTour();
  // Compute the boolean here so the effect can depend on its VALUE (not the
  // identity of the function). Without this, the effect captures a stale
  // `isPageTourActive` from the pre-hydration render, returns early, and
  // never reschedules once TourProvider finishes loading localStorage —
  // so pages render mock data (their JSX re-reads tourActive on re-render)
  // while the driver overlay never starts.
  const active = tour.isPageTourActive(page);
  // Holds the active driver instance so cleanup can destroy it if user navigates away
  const driverRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    if (!active) return;

    // `cancelled` handles React Strict Mode double-invocation:
    // First run: cancelled=false → timer set
    // Cleanup (Strict Mode unmount): cancelled=true → timer aborted, driverRef still null
    // Second run (real mount): fresh cancelled=false → timer fires
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      if (cancelled) return;

      const { driver } = await import("driver.js");

      const steps = TOUR_STEPS[page];
      if (!steps?.length || cancelled) return;

      const driverObj = driver({
        showProgress: true,
        showButtons: ["next", "previous", "close"],
        nextBtnText: "Next →",
        prevBtnText: "← Back",
        doneBtnText: "Done",
        progressText: "{{current}} of {{total}}",
        popoverClass: "allocat-tour-popover",
        overlayColor: "rgb(0,0,0)",
        overlayOpacity: 0.72,
        onDestroyStarted: () => {
          driverRef.current = null;
          tour.markSeen(page);
          driverObj.destroy();
        },
        steps,
      });

      driverRef.current = driverObj;
      driverObj.drive();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      // If driver was active when user navigated away, destroy it so the
      // overlay is removed and markSeen is called via onDestroyStarted.
      if (driverRef.current) {
        const d = driverRef.current;
        driverRef.current = null;
        d.destroy();
      }
    };
  // Re-run when navigating to a new page OR when `active` flips
  // (post-hydration of TourProvider, user toggling tour on/off, etc.).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, active]);
}
