import { getDB } from "@/lib/db";
import {
  clampStartDay,
  rangeForLabel,
  resolvePeriod,
  toISODate,
  type PeriodLabel,
  type ResolvedPeriod,
  type StoredBudgetPeriod,
} from "@/lib/budget/period";

/**
 * IDB-backed accessors over the pure period math in `lib/budget/period.ts`.
 * Browser-only (uses `getDB()`); never call on the server.
 */

/** The profile's budget start day (1–28); a missing profile means 1. */
export async function getStartDayIDB(): Promise<number> {
  const rows = await getDB().profiles.toArray();
  return clampStartDay(rows[0]?.budget_start_day);
}

/** Every cached budget, reduced to what cycle math needs. */
export async function getStoredPeriodsIDB(): Promise<StoredBudgetPeriod[]> {
  const rows = await getDB().budgets.toArray();
  return rows.map((b) => ({
    id: b.id,
    month: b.month,
    year: b.year,
    period_start: b.period_start,
    period_end: b.period_end,
  }));
}

/** The cycle containing `date` (default now). Accepts a Date or "YYYY-MM-DD". */
export async function resolvePeriodIDB(date?: Date | string | null): Promise<ResolvedPeriod> {
  const iso = typeof date === "string" ? date.slice(0, 10) : toISODate(date ?? new Date());
  const [startDay, budgets] = await Promise.all([getStartDayIDB(), getStoredPeriodsIDB()]);
  return resolvePeriod(iso, budgets, startDay);
}

/** The cycle for an explicit label: its stored row wins, else computed. */
export async function rangeForLabelIDB(label: PeriodLabel): Promise<ResolvedPeriod> {
  const [startDay, budgets] = await Promise.all([getStartDayIDB(), getStoredPeriodsIDB()]);
  return rangeForLabel(label, budgets, startDay);
}
