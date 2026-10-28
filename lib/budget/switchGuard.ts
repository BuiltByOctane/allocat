/**
 * Pure guards for the start-day switch server action (`lib/actions/budget-cycle.ts`).
 * Kept outside the "use server" module so they can be unit-tested and so the
 * module exports only actions.
 */
import { addDays, type ISODate, type SwitchPlan } from "@/lib/budget/period";

export const DEVICE_DATE_ERROR = "Your device date looks wrong. Check it and try again.";
export const STALE_PLAN_ERROR = "Your budgets changed — review and try again.";

/** What the client previewed — the server must be about to do exactly this. */
export interface ExpectedSwitch {
  deleteBudgetIds: string[];
  currentEnd: ISODate | null;
}

/**
 * `today` is the client's local date: a strict, real "YYYY-MM-DD" within one
 * day of the server's UTC date (covers every real timezone offset).
 */
export function isAcceptableClientDate(today: unknown, serverToday: ISODate): today is ISODate {
  if (typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  // addDays round-trips through a day number, normalising e.g. 2026-02-30.
  if (addDays(today, 0) !== today) return false;
  return today >= addDays(serverToday, -1) && today <= addDays(serverToday, 1);
}

/**
 * True when the server's plan deletes exactly the budgets the user was warned
 * about (order-insensitive) and ends the current budget on the previewed day.
 * A null server plan matches only an expectation of no change at all.
 */
export function planMatchesExpected(plan: SwitchPlan | null, expected: ExpectedSwitch): boolean {
  const serverIds = plan?.deleteBudgetIds ?? [];
  const serverEnd = plan?.current?.end ?? null;
  if (serverEnd !== expected.currentEnd) return false;
  const a = new Set(serverIds);
  const b = new Set(expected.deleteBudgetIds);
  if (a.size !== serverIds.length || b.size !== expected.deleteBudgetIds.length) return false;
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}
