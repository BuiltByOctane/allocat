"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSync } from "@/lib/hooks/useSync";
import {
  useCarryBudget,
  useCarryMarker,
  useUndoCarry,
  useDismissCarryBanner,
} from "@/lib/hooks/useBudgetCarry";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { getStartDayChoiceIDB, resolvePeriodIDB } from "@/lib/budget/periodIDB";

/**
 * Global auto-carry: once IDB is hydrated, copy the most recent prior budget
 * into the CURRENT budget cycle if it's still empty — so the dashboard hero populates
 * without the user ever visiting /budget. Shows a one-tap confirm/undo banner.
 * The current cycle is resolved from IDB on every fire (start-day aware).
 * Other (peeked-at) months never auto-carry; they get an explicit CTA in the
 * budget empty state instead. Mounted once in app/(app)/layout.tsx.
 *
 * A never-chosen start day (new account that skipped the question) skips the
 * auto-carry entirely — no prompt, no budget: a 1st-based cycle stamped now is
 * one the user's later pick would have to stretch. The budget page asks.
 */
export function CarryController() {
  const { isHydrated } = useSync();
  const router = useRouter();
  const haptic = useHaptic();

  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  });

  const carry = useCarryBudget();
  const undo = useUndoCarry();
  const dismiss = useDismissCarryBanner();
  const marker = useCarryMarker(period.month, period.year);

  const [undoBlocked, setUndoBlocked] = useState(false);
  const firedRef = useRef<string | null>(null);

  // Fire once per hydration + whenever the cycle rolls over (on the start
  // day) while the PWA stays open (visibilitychange re-check). The sync_meta
  // marker + the Dexie transaction inside useCarryBudget make re-fires
  // idempotent.
  useEffect(() => {
    if (!isHydrated) return;
    let cancelled = false;

    const fire = async () => {
      // Not marked as fired: the next visibility check retries once chosen.
      if ((await getStartDayChoiceIDB()) === null) return;
      const resolved = await resolvePeriodIDB();
      if (cancelled) return;
      const p = { month: resolved.month, year: resolved.year };
      setPeriod(p);
      const key = `${p.year}-${p.month}`;
      if (firedRef.current === key) return;
      firedRef.current = key;
      carry.mutate({ ...p, auto: true });
    };

    void fire();
    const onVisible = () => {
      if (document.visibilityState === "visible") void fire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
    // carry.mutate is stable; firedRef dedupes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated]);

  const showBanner = marker.data?.state === "carried";
  if (!showBanner) return null;

  return (
    <div
      className="md:hidden fixed left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-[448px]"
      style={{ bottom: "calc(86px + env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center gap-2 rounded-2xl bg-card border border-border shadow-lg px-3.5 py-2.5">
        <span className="material-symbols-outlined text-primary text-[20px] shrink-0">
          content_copy
        </span>
        <p className="flex-1 text-xs font-medium text-foreground leading-snug">
          {undoBlocked
            ? "Spends already logged - edit instead"
            : `Budget copied from ${marker.data?.sourceLabel ?? "last month"}`}
        </p>
        <button
          type="button"
          className="text-xs font-semibold text-primary px-2 py-1 rounded-lg active:opacity-70"
          onClick={() => {
            haptic.light();
            dismiss.mutate(period);
            router.push("/budget");
          }}
        >
          Edit
        </button>
        {!undoBlocked && (
          <button
            type="button"
            className="text-xs font-semibold text-muted-foreground px-2 py-1 rounded-lg active:opacity-70 disabled:opacity-50"
            disabled={undo.isPending}
            onClick={async () => {
              haptic.light();
              const res = await undo.mutateAsync(period);
              if (res.blocked) setUndoBlocked(true);
              else haptic.success();
            }}
          >
            Undo
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss"
          className="text-muted-foreground p-1 rounded-lg active:opacity-70"
          onClick={() => dismiss.mutate(period)}
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </div>
  );
}
