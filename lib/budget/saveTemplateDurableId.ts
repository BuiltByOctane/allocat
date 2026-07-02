/**
 * Durable id used when capturing an EXISTING budget as a template
 * ("Save as template" in `components/budget/BudgetSetupSheet.tsx`). Must
 * resolve to the same id that gets stamped onto the underlying
 * `budget_items` row (`sourceItemId`), not the ephemeral form-item id, so the
 * saved template's `templateItemId`s line up with what's stamped.
 *
 * `sourceItemId` may be a `temp_<uuid>` id if the budget was built offline.
 * `SyncEngine.resolvePayload` rewrites `temp_` ids to real server ids inside
 * queued payloads (e.g. the STAMP_TEMPLATE items) at flush time, but the
 * template JSON written by `saveBudgetTemplate` keeps whatever id was passed
 * in verbatim (it does not go through the sync queue). If a raw `temp_`
 * `sourceItemId` were used as the durable id, the template JSON and the
 * server-stamped `template_item_id` would diverge as soon as the queue
 * flushed, and next month's budget (built from that template) would never
 * resolve this month's learned rules.
 *
 * Falling back to `id` (a plain UUID minted by `prefillFromBudget`, never
 * touched by `resolvePayload`) keeps the template JSON, the optimistic IDB
 * stamp, and the queued STAMP_TEMPLATE payload identical by construction.
 */
export interface DurableIdItem {
  templateItemId?: string | null;
  sourceItemId?: string | null;
  id: string;
}

export function saveTemplateDurableId(i: DurableIdItem): string {
  if (i.templateItemId) return i.templateItemId;
  if (i.sourceItemId && !i.sourceItemId.startsWith("temp_")) {
    return i.sourceItemId;
  }
  return i.id;
}
