import { getDB } from "@/lib/db";

export interface NearLimitInfo {
  name: string;
  ratio: number;
  remaining: number;
  over: boolean;
}

export interface PaceInfo {
  name: string;
  /** Day-of-month the item is projected to run out. */
  byDay: number;
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
 * month-end (at the current daily rate)? Mirrors the native check in
 * SmsTransactionReceiver.java. Returns null when not yet at risk.
 */
export async function paceFromIDB(budgetItemId: string): Promise<PaceInfo | null> {
  const db = getDB();
  const item = await db.budget_items.get(budgetItemId);
  if (!item) return null;
  const planned = Number(item.planned_amount);
  const actual = Number(item.actual_amount);
  if (!(planned > 0) || !(actual > 0)) return null;

  const now = new Date();
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (day < 3) return null; // too early to project reliably
  const byDay = Math.ceil((planned * day) / actual);
  if (byDay > daysInMonth) return null; // on pace to stay within budget
  return { name: item.name, byDay };
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
