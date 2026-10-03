import { getDB } from "@/lib/db";
import type { SyncQueueItem } from "@/lib/db";
import { computeAutoCompletion } from "@/lib/utils/budget-completion";
import { applyLinkedSpendCascadeIDB } from "@/lib/utils/budget-cascade";
import { writeManualTransaction } from "@/lib/hooks/useSmsTransactions";

type EnqueueFn = (
  item: Omit<SyncQueueItem, "id" | "retries" | "status" | "createdAt">,
) => Promise<void>;

export interface QuickSpendResult {
  itemName: string;
  remaining: number;
  planned: number;
  actual: number;
}

/** temp ids may already have been swapped for a real one by SyncEngine. */
async function resolveItemId(itemId: string): Promise<string> {
  if (!itemId.startsWith("temp_")) return itemId;
  const mapping = await getDB().id_map.get(itemId);
  return mapping?.realId ?? itemId;
}

/**
 * Log a spend against a budget item: bump `actual_amount` in IDB, mirror the
 * linked asset/debt cascade, queue the PAYMENT and a ledger row.
 *
 * An item created moments ago (the "create new item" branch of the manual
 * spend sheet) can finish its INSERT while this runs: `replaceIDBRecord`
 * deletes the temp row and re-puts it under the real id, recording the swap
 * only in `id_map`. Both the read and the write therefore go through
 * `resolveItemId`, and a write that hit no row (swapped in between) re-reads.
 *
 * When the item is not in IDB at all the spend is only queued — never also
 * sent directly, which used to apply it twice on the server.
 */
export async function applyQuickSpend(
  input: { itemId: string; amount: number; label?: string | null },
  deps: { enqueue: EnqueueFn },
): Promise<QuickSpendResult | null> {
  const { amount, label } = input;
  const { enqueue } = deps;
  const db = getDB();
  // Profile currency for the ledger row (falls back to INR).
  const profiles = await db.profiles.toArray();
  const currency = profiles[0]?.currency ?? "INR";

  let itemId = await resolveItemId(input.itemId);
  let result: QuickSpendResult | null = null;

  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    const item = await db.budget_items.get(itemId);
    if (!item) {
      const next = await resolveItemId(input.itemId);
      if (next === itemId) break;
      itemId = next;
      continue;
    }
    const newActual = Number(item.actual_amount) + amount;
    const planned = Number(item.planned_amount);
    const updated = await db.budget_items.update(itemId, {
      actual_amount: newActual,
      is_completed: computeAutoCompletion(planned, newActual),
      updated_at: new Date().toISOString(),
    });
    if (updated === 0) {
      // Row swapped temp→real between the read and the write — re-read.
      itemId = await resolveItemId(input.itemId);
      continue;
    }
    // Mirror the server cascade optimistically: a spend on an asset/debt-
    // linked item moves the linked target now (server quickLogSpend does the
    // same via addAssetEntry/makePayment). Matches the item-sheet path.
    await applyLinkedSpendCascadeIDB(item, { actual_amount: newActual });
    result = { itemName: item.name, remaining: planned - newActual, planned, actual: newActual };
  }

  await enqueue({
    table: "budget_items",
    operation: "PAYMENT",
    recordId: itemId,
    payload: { itemId, amount },
  });
  // Ledger record only — the PAYMENT above already bumps actual_amount, so the
  // manual transaction's server insert must NOT re-apply the spend.
  await writeManualTransaction(
    { budgetItemId: itemId, amount, currency, label: label ?? null },
    { enqueue },
  );
  return result;
}
