import { getDB } from "@/lib/db";
import type { BudgetItemRow } from "@/lib/db";

export type LinkType = "asset" | "debt";

export interface CascadeResult {
  touchedNetWorth: boolean;
  touchedGoals: boolean;
  touchedDebt: boolean;
}

/**
 * Applies an IDB-side cascade when an item's actual_amount has increased
 * and the item is linked to an asset / goal / debt. Mirrors the server-side
 * logic in updateBudgetItem so the UI reflects the change instantly.
 */
export async function applyLinkedSpendCascadeIDB(
  existing: BudgetItemRow,
  updates: {
    actual_amount?: number;
    link_type?: LinkType | null;
    link_id?: string | null;
  }
): Promise<CascadeResult> {
  const result: CascadeResult = {
    touchedNetWorth: false,
    touchedGoals: false,
    touchedDebt: false,
  };

  if (updates.actual_amount === undefined) return result;

  const effectiveLinkType =
    (updates.link_type !== undefined ? updates.link_type : existing.link_type) as
      LinkType | null | undefined;
  const effectiveLinkId =
    (updates.link_id !== undefined ? updates.link_id : existing.link_id) as
      string | null | undefined;

  if (!effectiveLinkType || !effectiveLinkId) return result;

  const delta = Number(updates.actual_amount) - Number(existing.actual_amount);
  if (delta <= 0) return result;

  const db = getDB();
  const nowIso = new Date().toISOString();
  const today = nowIso.split("T")[0];

  if (effectiveLinkType === "asset") {
    const asset = await db.assets.get(effectiveLinkId);
    if (asset) {
      const newValue = Number(asset.value) + delta;
      await db.assets.update(effectiveLinkId, {
        value: newValue,
        invested_amount: Number(asset.invested_amount ?? asset.value) + delta,
        updated_at: nowIso,
      });
      await db.asset_value_history.add({
        id: `temp_hist_${crypto.randomUUID()}`,
        asset_id: effectiveLinkId,
        user_id: asset.user_id,
        entry_type: "add_funds",
        amount: delta,
        running_total: newValue,
        note: `Budget: ${existing.name}`,
        entry_date: today,
        created_at: nowIso,
      });
      result.touchedNetWorth = true;
      // Goal-asset bumps reflect on goals page too
      if (asset.is_goal) result.touchedGoals = true;
    }
  } else if (effectiveLinkType === "debt") {
    const debt = await db.debts.get(effectiveLinkId);
    if (debt) {
      const newPaid = Number(debt.total_paid) + delta;
      const repayableTarget =
        Number(debt.total_repayable) > 0
          ? Number(debt.total_repayable)
          : Number(debt.principal);
      await db.debts.update(effectiveLinkId, {
        total_paid: newPaid,
        is_closed: debt.is_closed || newPaid >= repayableTarget,
        updated_at: nowIso,
      });
      result.touchedDebt = true;
      result.touchedNetWorth = true;
    }
  }

  return result;
}
