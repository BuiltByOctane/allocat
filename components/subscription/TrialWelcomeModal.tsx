"use client";

import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useProfile } from "@/lib/hooks/useProfile";
import { useEntitlement } from "@/lib/providers/EntitlementProvider";
import { useStartTrial } from "@/lib/hooks/useSubscription";
import { TRIAL_DAYS } from "@/lib/subscription/limits";

const SEEN_KEY = "allocat-trial-welcome-seen";

/**
 * One-time welcome on first authenticated load offering the opt-in free trial.
 * Only shows when the user has never started a trial and never paid. Dismissing
 * sets a "seen" flag so it doesn't nag — the trial can still be started later
 * from the paywall. Auto-start is intentionally avoided: the trial is opt-in.
 */
export function TrialWelcomeModal() {
  const { data: profile } = useProfile();
  const entitlement = useEntitlement();
  const startTrial = useStartTrial();
  const haptic = useHaptic();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!profile) return; // wait for hydration
    if (entitlement.hasUsedTrial) return; // already trialed/paid
    if (entitlement.tier === "premium") return;
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      return;
    }
    // Defer out of the effect body (avoids a hydration flash and the
    // set-state-in-effect lint) — same approach as InstallPrompt.
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [profile, entitlement.hasUsedTrial, entitlement.tier]);

  const markSeen = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const dismiss = () => {
    markSeen();
    setOpen(false);
  };

  const begin = () => {
    haptic.medium();
    markSeen();
    startTrial.mutate(undefined, { onSuccess: () => setOpen(false) });
  };

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && dismiss()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card px-5 pt-3 pb-safe focus:outline-none max-w-[480px] mx-auto">
          <div className="flex justify-center pb-4 shrink-0">
            <div className="w-9 h-1 bg-border rounded-full" />
          </div>

          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent/15 mb-3">
              <span className="material-symbols-outlined text-accent text-[28px]">
                celebration
              </span>
            </div>
            <Drawer.Title className="font-display text-[22px] font-bold tracking-[-0.02em] text-foreground">
              {TRIAL_DAYS} days of Premium, on us
            </Drawer.Title>
            <p className="text-sm text-muted-foreground mt-2">
              Unlock AI insights, unlimited goals, assets, debts, and full
              history — free for {TRIAL_DAYS} days. No card needed.
            </p>
          </div>

          <div className="flex flex-col gap-3 pb-6">
            <button
              disabled={startTrial.isPending}
              onClick={begin}
              className="w-full py-3.5 bg-accent text-accent-ink font-bold rounded-pill active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {startTrial.isPending ? "Starting…" : "Start free trial"}
            </button>
            <button
              onClick={() => {
                haptic.light();
                dismiss();
              }}
              className="w-full py-3 text-muted-foreground font-semibold rounded-pill active:scale-[0.98] transition-all"
            >
              Maybe later
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
