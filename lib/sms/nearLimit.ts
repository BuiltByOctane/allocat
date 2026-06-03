import { getDB } from "@/lib/db";

export interface NearLimitInfo {
  name: string;
  ratio: number;
  remaining: number;
  over: boolean;
}

const THRESHOLD = 0.9;

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
