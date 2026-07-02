/**
 * Group categorized SMS transactions into their budget-item buckets for a
 * SPECIFIC month, on the Allocated tab. A txn belongs to the month of the
 * BUDGET ITEM it's allocated to (authoritative), not its own occurred_at —
 * budget items get fresh UUIDs every month a template is applied (see
 * `lib/sms/resolveRuleItem.ts`), so "is this item in this month's budget" is
 * the only reliable membership test.
 *
 * Orphans (null budget_item_id, or an item id that no longer exists anywhere —
 * i.e. the item was deleted) have no month of their own, so they fall back to
 * their occurred_at (or created_at) timestamp to decide which month's list
 * they show up in.
 *
 * A txn allocated to an item that exists but belongs to a DIFFERENT month's
 * budget is excluded entirely from this month's view (it'll show up when that
 * other month is selected).
 *
 * Uses narrow structural types (mirrors `lib/sms/resolveRuleItem.ts`) so this
 * stays testable with plain objects — no IDB/Dexie needed.
 */

const UNKNOWN_GROUP_ID = "__unknown__";

/** The txn fields this module needs (subset of a sms_transactions row). */
export interface AllocTxnRow {
  id: string;
  budget_item_id: string | null;
  occurred_at: string | null;
  created_at: string;
}

/** The budget_items fields this module needs. */
export interface AllocBudgetItemRow {
  id: string;
  name: string;
  category_id: string;
  emoji?: string | null;
}

/** The categories fields this module needs. */
export interface AllocCategoryRow {
  id: string;
  name: string;
  icon: string | null;
}

export interface AllocatedGroupItemMeta {
  itemName: string;
  categoryName: string;
  /** Item's own emoji, falling back to the category icon — the single glyph
   * the Allocated tab renders (mirrors today's `item.emoji || category.icon`). */
  icon: string | null;
}

export interface AllocatedGroup<T extends AllocTxnRow = AllocTxnRow> {
  /** budget_item_id, or "__unknown__" for the orphan group. */
  itemId: string;
  /** null → render "Unknown / deleted item". */
  item: AllocatedGroupItemMeta | null;
  txns: T[];
}

/** True if `iso` (or its Date) falls within the given calendar month/year. */
function isInMonth(iso: string | null, month: number, year: number): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

export function groupAllocationsForMonth<T extends AllocTxnRow>(input: {
  /** ALL categorized txns (any month). */
  txns: T[];
  /** Budget items belonging to the SELECTED month's budget. */
  monthItems: AllocBudgetItemRow[];
  /** Categories belonging to the selected month's budget. */
  monthCats: AllocCategoryRow[];
  /** Every budget_items id across all months — used to tell "deleted" apart
   * from "belongs to a different month". */
  allItemIds: Set<string>;
  month: number;
  year: number;
}): AllocatedGroup<T>[] {
  const { txns, monthItems, monthCats, allItemIds, month, year } = input;

  const monthItemIds = new Set(monthItems.map((i) => i.id));
  const itemsById = new Map(monthItems.map((i) => [i.id, i] as const));
  const catsById = new Map(monthCats.map((c) => [c.id, c] as const));

  const included = txns.filter((t) => {
    const bid = t.budget_item_id;
    if (bid && monthItemIds.has(bid)) return true;
    if (bid && allItemIds.has(bid)) return false; // belongs to another month
    // Orphan: null budget_item_id, or an item id that exists nowhere (deleted).
    return isInMonth(t.occurred_at ?? t.created_at, month, year);
  });

  // Newest-first, mirroring the existing Allocated tab's ordering
  // (getCategorizedSmsFromIDB sorts by created_at descending).
  const sorted = [...included].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  const groups: AllocatedGroup<T>[] = [];
  const indexByKey = new Map<string, number>();

  for (const t of sorted) {
    const bid = t.budget_item_id;
    const key = bid && monthItemIds.has(bid) ? bid : UNKNOWN_GROUP_ID;
    let pos = indexByKey.get(key);
    if (pos === undefined) {
      pos = groups.length;
      indexByKey.set(key, pos);
      let item: AllocatedGroupItemMeta | null = null;
      if (key !== UNKNOWN_GROUP_ID) {
        const bi = itemsById.get(key);
        if (bi) {
          const cat = catsById.get(bi.category_id);
          item = {
            itemName: bi.name,
            categoryName: cat?.name ?? "",
            icon: bi.emoji ?? cat?.icon ?? null,
          };
        }
      }
      groups.push({ itemId: key, item, txns: [] });
    }
    groups[pos].txns.push(t);
  }

  return groups;
}
