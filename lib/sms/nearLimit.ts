import { getDB } from "@/lib/db";
import { resolvePeriodIDB } from "@/lib/budget/periodIDB";
import { addDays, daysElapsed, periodDays, toISODate } from "@/lib/budget/period";

export interface NearLimitInfo {
  name: string;
  ratio: number;
  remaining: number;
  over: boolean;
}

export interface PaceInfo {
  name: string;
  /** Cycle-day number (1 = cycle start) the item is projected to run out —
   * equal to the day of month for a start-day-1 cycle. */
  byDay: number;
  /** Day of month of that cycle day — what the notification copy shows. */
  byDayOfMonth: number;
}

const THRESHOLD = 0.9;

/** "3" → "3rd", "21" → "21st". */
export function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Predictive pace check: after a spend, is the item on track to run out before
 * the current budget cycle ends (at the current daily rate)? Mirrors the native check in
 * SmsTransactionReceiver.java. Returns null when not yet at risk.
 */
export async function paceFromIDB(budgetItemId: string): Promise<PaceInfo | null> {
  const db = getDB();
  const item = await db.budget_items.get(budgetItemId);
  if (!item) return null;
  const planned = Number(item.planned_amount);
  const actual = Number(item.actual_amount);
  if (!(planned > 0) || !(actual > 0)) return null;

  const period = await resolvePeriodIDB();
  const day = daysElapsed(period, toISODate(new Date()));
  const len = periodDays(period);
  if (day < 3) return null; // too early to project reliably
  const byDay = Math.ceil((planned * day) / actual);
  if (byDay > len) return null; // on pace to stay within budget
  const byDayOfMonth = Number(addDays(period.start, byDay - 1).slice(8, 10));
  return { name: item.name, byDay, byDayOfMonth };
}

/**
 * Near-limit check from IDB after a spend is applied. Checks the budget ITEM
 * first (actual vs planned — what the user allocates against), falling back to
 * the CATEGORY (spent vs allocated). Returns info when ≥90% consumed, else null.
 * Mirrors the server-side check in lib/actions/sms.ts. Call AFTER the item's
 * actual_amount has been optimistically updated.
 */
export async function nearLimitFromIDB(
  budgetItemId: string,
): Promise<NearLimitInfo | null> {
  const db = getDB();
  const item = await db.budget_items.get(budgetItemId);
  if (!item) return null;

  // Item-level: actual vs planned.
  const planned = Number(item.planned_amount);
  const actual = Number(item.actual_amount);
  if (planned > 0 && actual / planned >= THRESHOLD) {
    return {
      name: item.name,
      ratio: actual / planned,
      remaining: Math.max(0, planned - actual),
      over: actual >= planned,
    };
  }

  // Category-level fallback: total spent vs allocated.
  const cat = await db.categories.get(item.category_id);
  if (cat) {
    const allocated = Number(cat.allocated_amount);
    if (allocated > 0) {
      const items = await db.budget_items
        .where("category_id")
        .equals(cat.id)
        .toArray();
      const spent = items.reduce((s, i) => s + Number(i.actual_amount), 0);
      if (spent / allocated >= THRESHOLD) {
        return {
          name: cat.name,
          ratio: spent / allocated,
          remaining: Math.max(0, allocated - spent),
          over: spent >= allocated,
        };
      }
    }
  }

  return null;
}
