import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getStartDayIDB,
  getStoredPeriodsIDB,
  rangeForLabelIDB,
  resolvePeriodIDB,
} from "@/lib/budget/periodIDB";
import {
  resolvePeriod,
  stepResolved,
  toISODate,
  type PeriodLabel,
  type ResolvedPeriod,
} from "@/lib/budget/period";

/** The cycle containing today. Invalidate this prefix after a start-day switch. */
export const CURRENT_PERIOD_KEY = ["currentPeriod"] as const;
const START_DAY_KEY = [...CURRENT_PERIOD_KEY, "startDay"] as const;

/**
 * The current budget cycle + the user's start day. Before IDB answers it is the
 * calendar month of today with start day 1 — never undefined. Refetches on
 * window focus so a cycle rollover is picked up while the app stays open.
 */
export function useCurrentPeriod(): { period: ResolvedPeriod; startDay: number; isLoading: boolean } {
  const periodQ = useQuery({
    queryKey: CURRENT_PERIOD_KEY,
    queryFn: () => resolvePeriodIDB(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const startQ = useQuery({
    queryKey: START_DAY_KEY,
    queryFn: () => getStartDayIDB(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const fallback = useMemo(() => resolvePeriod(toISODate(new Date()), [], 1), []);
  return {
    period: periodQ.data ?? fallback,
    startDay: startQ.data ?? 1,
    isLoading: periodQ.isLoading || startQ.isLoading,
  };
}

/** Stable navigation helpers; each call reads IDB fresh (no React state). */
export function usePeriodNavigator(): {
  step(from: ResolvedPeriod, delta: 1 | -1): Promise<ResolvedPeriod>;
  rangeFor(label: PeriodLabel): Promise<ResolvedPeriod>;
} {
  const step = useCallback(async (from: ResolvedPeriod, delta: 1 | -1) => {
    const [budgets, startDay] = await Promise.all([getStoredPeriodsIDB(), getStartDayIDB()]);
    return stepResolved(from, delta, budgets, startDay);
  }, []);
  const rangeFor = useCallback((label: PeriodLabel) => rangeForLabelIDB(label), []);
  return useMemo(() => ({ step, rangeFor }), [step, rangeFor]);
}
