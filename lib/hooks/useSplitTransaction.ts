import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getDB } from "@/lib/db";
import type { SyncQueueItem, SmsTransactionRow } from "@/lib/db";
import { useEnqueue } from "@/lib/hooks/useSync";
import { ALLOCATE_PICKER_KEY } from "@/lib/hooks/useAllocatePicker";
import {
  invalidateSmsCaches,
  notifyNearLimitForItem,
} from "@/lib/hooks/useSmsTransactions";
import { computeAutoCompletion } from "@/lib/utils/budget-completion";
import { applyLinkedSpendCascadeIDB } from "@/lib/utils/budget-cascade";
import { randomUUID } from "@/lib/utils/uuid";
import {
  validateSplit,
  resolveSplitAmounts,
  smsSplitDedupeKey,
  manualSplitDedupeKey,
  type SplitPartDraft,
  type SplitPartPayload,
  type SplitTxnPayload,
} from "@/lib/sms/split";

type EnqueueFn = (
  item: Omit<SyncQueueItem, "id" | "retries" | "status" | "createdAt">,
) => Promise<void>;

export interface SplitInput {
  sourceTxnId: string | null;
  total: number;
  label: string | null;
  parts: SplitPartDraft[];
}

/** temp ids may already have been swapped for a real one by SyncEngine. */
async function resolveId(id: string): Promise<string> {
  if (!id.startsWith("temp_")) return id;
  const mapping = await getDB().id_map.get(id);
  return mapping?.realId ?? id;
}

export async function applySplit(
  input: SplitInput,
  deps: { enqueue: EnqueueFn; uuid?: () => string },
): Promise<{ splitId: string }> {
  if (!validateSplit(input.total, input.parts).ok) throw new Error("Invalid split");
  const uuid = deps.uuid ?? randomUUID;
  const amounts = resolveSplitAmounts(input.total, input.parts);
  const splitId = uuid();
  const db = getDB();
  const now = new Date().toISOString();

  // Resolve budget item ids (a just-created item may have swapped temp -> real)
  // and require every part's item up front: a missing one must fail the whole
  // split before any row is written, never silently drop a part.
  const itemIds = await Promise.all(input.parts.map((p) => resolveId(p.budgetItemId)));
  for (let i = 0; i < itemIds.length; i++) {
    let found = await db.budget_items.get(itemIds[i]);
    if (!found) {
      // Swapped temp -> real between resolve and read: re-resolve once.
      itemIds[i] = await resolveId(input.parts[i].budgetItemId);
      found = await db.budget_items.get(itemIds[i]);
    }
    if (!found) throw new Error("Split item not found");
  }

  // Source row (SMS) or profile currency (manual). Validate before any write.
  let source: SmsTransactionRow | undefined;
  let sourceId: string | null = null;
  if (input.sourceTxnId) {
    sourceId = await resolveId(input.sourceTxnId);
    source = await db.sms_transactions.get(sourceId);
    if (!source || source.status !== "pending") {
      throw new Error("Transaction is no longer pending");
    }
  }
  const currency =
    source?.currency ?? (await db.profiles.toArray())[0]?.currency ?? "INR";
  const label = input.label ?? null;

  // Optimistic ledger rows + payload parts.
  const payloadParts: SplitPartPayload[] = [];
  for (let i = 0; i < amounts.length; i++) {
    const n = i + 1;
    const isSourcePart = source != null && i === 0;
    const dedupeKey = source
      ? i === 0
        ? source.dedupe_key
        : smsSplitDedupeKey(source.dedupe_key, splitId, n)
      : manualSplitDedupeKey(splitId, n);
    const tempId = isSourcePart ? null : `temp_${uuid()}`;

    if (isSourcePart && sourceId) {
      await db.sms_transactions.update(sourceId, {
        status: "categorized",
        budget_item_id: itemIds[i],
        amount: amounts[i],
        label,
        matched_rule_id: null,
      });
    } else if (tempId) {
      await db.sms_transactions.add({
        id: tempId,
        user_id: "__pending__",
        raw_text: null,
        sender: null,
        amount: amounts[i],
        currency,
        merchant_raw: source?.merchant_raw ?? null,
        merchant_normalized: source?.merchant_normalized ?? null,
        direction: "debit",
        occurred_at: source?.occurred_at ?? now,
        dedupe_key: dedupeKey,
        template_key: null,
        status: "categorized",
        matched_rule_id: null,
        budget_item_id: itemIds[i],
        label,
        source: source ? "sms" : "manual",
        original_amount: null,
        created_at: now,
      });
    }
    payloadParts.push({
      budgetItemId: itemIds[i],
      amount: amounts[i],
      dedupeKey,
      tempId,
    });
  }

  // Budget item actuals, linked cascade, near-limit alerts. An item created
  // moments ago can swap temp -> real between the read and the write (the
  // update then hits no row), so re-resolve and retry like applyQuickSpend.
  for (let i = 0; i < itemIds.length; i++) {
    let applied = false;
    for (let attempt = 0; attempt < 2 && !applied; attempt++) {
      const item = await db.budget_items.get(itemIds[i]);
      if (!item) {
        const next = await resolveId(input.parts[i].budgetItemId);
        if (next === itemIds[i]) break;
        itemIds[i] = next;
        payloadParts[i].budgetItemId = next;
        continue;
      }
      const newActual = Number(item.actual_amount) + amounts[i];
      const planned = Number(item.planned_amount);
      const patch: {
        actual_amount: number;
        is_completed: boolean;
        overspend_count?: number;
        updated_at: string;
      } = {
        actual_amount: newActual,
        is_completed: computeAutoCompletion(planned, newActual),
        updated_at: now,
      };
      if (planned > 0 && newActual > planned) {
        patch.overspend_count = Number(item.overspend_count ?? 0) + 1;
      }
      const updated = await db.budget_items.update(itemIds[i], patch);
      if (updated === 0) {
        const next = await resolveId(input.parts[i].budgetItemId);
        if (next !== itemIds[i]) {
          itemIds[i] = next;
          payloadParts[i].budgetItemId = next;
        }
        continue;
      }
      await applyLinkedSpendCascadeIDB(item, { actual_amount: newActual });
      applied = true;
    }
    await notifyNearLimitForItem(itemIds[i], currency);
  }

  const payload: SplitTxnPayload = {
    splitId,
    sourceTxnId: sourceId,
    total: input.total,
    currency,
    label,
    merchantRaw: source?.merchant_raw ?? null,
    merchantNormalized: source?.merchant_normalized ?? null,
    occurredAt: source?.occurred_at ?? now,
    parts: payloadParts,
  };
  await deps.enqueue({
    table: "sms_transactions",
    operation: "SPLIT",
    recordId: sourceId ?? `split_${splitId}`,
    payload: payload as unknown as Record<string, unknown>,
  });
  return { splitId };
}

export function useSplitTransaction() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();
  return useMutation<{ splitId: string }, Error, SplitInput>({
    mutationFn: (input) => applySplit(input, { enqueue }),
    onSuccess: () => {
      invalidateSmsCaches(qc);
      qc.invalidateQueries({ queryKey: ALLOCATE_PICKER_KEY });
    },
  });
}
