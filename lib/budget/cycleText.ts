/**
 * Copy helpers for the budget-cycle start-day switch. Pure string formatting
 * over `lib/budget/period.ts` types — no Date objects, so no timezone shifts.
 */
import { periodDays, type ISODate, type PeriodLabel, type SwitchPlan } from "@/lib/budget/period";

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 1 ⇒ "1st", 2 ⇒ "2nd", 11 ⇒ "11th", 22 ⇒ "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Start day 15 ⇒ "15th → 14th"; start day 1 ⇒ "1st → month end". */
export function cycleRangeText(startDay: number): string {
  return startDay === 1 ? "1st → month end" : `${ordinal(startDay)} → ${ordinal(startDay - 1)}`;
}

/** "2026-11-14" ⇒ "Nov 14". */
export function shortDate(date: ISODate): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS_LONG[m - 1].slice(0, 3)} ${d}`;
}

export function monthName(month: number): string {
  return MONTHS_LONG[month - 1];
}

/** The switch preview line shown under the day picker. */
export function switchPreviewText(plan: SwitchPlan): string {
  const cycle = cycleRangeText(plan.startDay);
  if (!plan.current) return `Your budgets will run ${cycle}.`;
  const { start, end } = plan.current;
  return (
    `Your current budget will run ${shortDate(start)} – ${shortDate(end)} ` +
    `(${periodDays({ start, end })} days). From then on, each budget runs ${cycle}.`
  );
}

/** Warning for a future budget swallowed by the stretched current one. */
export function absorbedWarning(
  removed: PeriodLabel,
  current: NonNullable<SwitchPlan["current"]>,
): string {
  return (
    `Your ${monthName(removed.month)} plan will be removed. ` +
    `${monthName(current.month)} now runs until ${shortDate(current.end)}.`
  );
}
