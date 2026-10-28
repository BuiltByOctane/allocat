"use client";

import { useCallback, useState, type ReactNode } from "react";
import { BudgetCycleSheet } from "@/components/budget/BudgetCycleSheet";
import { getStartDayChoiceIDB } from "@/lib/budget/periodIDB";

export interface StartDayGate<I> {
  /**
   * Call before creating a budget. Resolves true when a start day is already
   * stored (go ahead now). Otherwise opens the first-time picker and resolves
   * false; once the user saves a day, `resume` holds `intent` for the caller
   * to replay against the re-resolved period.
   */
  request(intent: I): Promise<boolean>;
  /** The gated intent to replay, set after a successful pick. */
  resume: { intent: I } | null;
  /** Mark `resume` handled (call before replaying it). */
  clearResume(): void;
  /** The picker sheet — render it where it survives the caller re-mounting. */
  sheet: ReactNode;
}

/**
 * New accounts choose their budget-cycle start day before their first budget
 * (existing users were back-filled with 1 and are never asked). Once a day is
 * stored — here, in onboarding or from Profile — `request` always passes.
 *
 * The picker reuses `BudgetCycleSheet` in first-time mode. Saving changes the
 * current period (and possibly its label), which can re-mount the page that
 * asked; hold this hook ABOVE that boundary and replay `resume` from below.
 */
export function useStartDayGate<I>(options?: { nested?: boolean }): StartDayGate<I> {
  const [pending, setPending] = useState<{ intent: I } | null>(null);
  const [resume, setResume] = useState<{ intent: I } | null>(null);

  const request = useCallback(async (intent: I): Promise<boolean> => {
    let choice: number | null = null;
    try {
      choice = await getStartDayChoiceIDB();
    } catch {
      /* IDB unavailable — ask; the sheet re-reads the server profile */
    }
    if (choice !== null) return true;
    setPending({ intent });
    return false;
  }, []);

  const clearResume = useCallback(() => setResume(null), []);

  const sheet = (
    <BudgetCycleSheet
      firstTime
      nested={options?.nested}
      open={pending !== null}
      onClose={() => setPending(null)}
      onSaved={() => {
        if (pending) setResume(pending);
      }}
    />
  );

  return { request, resume, clearResume, sheet };
}
