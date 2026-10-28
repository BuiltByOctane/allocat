"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { CalendarDays, X } from "lucide-react";
import { BudgetCycleSheet } from "@/components/budget/BudgetCycleSheet";
import { useCurrentPeriod } from "@/lib/hooks/useCurrentPeriod";
import { useHaptic } from "@/lib/hooks/useHaptic";

const DISMISS_KEY = "allocat-cycle-card-dismissed";

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Dashboard discovery row for the budget-cycle start day. Shown only while the
 * user is still on start day 1 and hasn't dismissed it (per-device).
 */
export function BudgetCycleCard() {
  const { startDay, isLoading } = useCurrentPeriod();
  const haptic = useHaptic();
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  // localStorage is client-only; server snapshot `true` keeps SSR markup empty.
  const storedDismissed = useSyncExternalStore(
    useCallback(() => () => {}, []),
    isDismissed,
    () => true,
  );

  // Keep the sheet mounted while open even if a save flips startDay off 1.
  if (!open && (isLoading || startDay !== 1 || dismissed || storedDismissed)) return null;

  const dismiss = () => {
    haptic.light();
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <>
      {!dismissed && !storedDismissed && startDay === 1 && (
        <div className="relative flex items-center gap-2.5 rounded-card border border-border bg-card px-3 py-2.5">
          <button
            type="button"
            onClick={() => {
              haptic.light();
              setOpen(true);
            }}
            className="flex flex-1 min-w-0 items-center gap-2.5 text-left active:scale-[0.99] transition-transform"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-accent/15 text-accent">
              <CalendarDays size={15} strokeWidth={2} />
            </span>
            <span className="flex-1 min-w-0 text-[11.5px] font-semibold leading-snug text-foreground">
              Salary not on the 1st? Match your budget to payday.
            </span>
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground active:scale-90 transition-transform"
          >
            <X size={14} strokeWidth={2.2} />
          </button>
        </div>
      )}
      <BudgetCycleSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export default BudgetCycleCard;
