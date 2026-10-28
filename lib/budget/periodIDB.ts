import { getDB } from "@/lib/db";
import type { BudgetRow } from "@/lib/db/AllocatDB";
import {
  clampStartDay,
  pickBudgetForPeriod,
  rangeForLabel,
  resolvePeriod,
  startDayChoice,
  toISODate,
  type ISODate,
  type PeriodLabel,
  type ResolvedPeriod,
  type StoredBudgetPeriod,
} from "@/lib/budget/period";

/**
 * IDB-backed accessors over the pure period math in `lib/budget/period.ts`.
 * Browser-only (uses `getDB()`); never call on the server.
 */

/** The EFFECTIVE budget start day (1–28) for date maths; unchosen or a missing profile means 1. */
export async function getStartDayIDB(): Promise<number> {
  return clampStartDay(await getStartDayChoiceIDB());
}

/**
 * The start day the user actually chose, or null when the cached profile is
 * missing or holds none (a new account that skipped the onboarding question).
 * Budget-creation flows ask for the day while this is null.
 */
export async function getStartDayChoiceIDB(): Promise<number | null> {
  const rows = await getDB().profiles.toArray();
  return startDayChoice(rows[0]?.budget_start_day);
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

/**
 * The cached budget row behind `period` — by id, falling back to the label
 * when the id is gone (a temp id swapped by sync) but only if that row's range
 * contains `date` (the date `period` was resolved for).
 */
export async function getBudgetForPeriodIDB(
  period: ResolvedPeriod,
  date: ISODate,
): Promise<BudgetRow | undefined> {
  const db = getDB();
  const byId = period.budgetId ? await db.budgets.get(period.budgetId) : undefined;
  if (byId) return byId;
  const sameLabel = await db.budgets
    .where("[month+year]")
    .equals([period.month, period.year])
    .toArray();
  return pickBudgetForPeriod(period, sameLabel, date);
}
