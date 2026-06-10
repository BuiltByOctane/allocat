/**
 * Build the IDB record to write when an INSERT syncs and its optimistic
 * `temp_` row is replaced by the server's record.
 *
 * Normally the server record wins. But local optimistic state the user advanced
 * *after* the optimistic insert and *before* that insert synced must survive.
 * The classic case: an `sms_transactions` row is ingested (status `pending`,
 * temp id) and the user allocates it (status `categorized`) before the INSERT
 * has flushed. The server's INSERT response still says `pending`, so a blind
 * replace reverts the row to `pending` — popping it back into the pending list
 * until the next hydrate. Preserving the locally-advanced status keeps the row
 * out of the list; the subsequent CATEGORIZE sync makes the server consistent.
 */
export function reconcileInsertReplacement(
  table: string,
  local: Record<string, unknown> | undefined,
  serverRecord: Record<string, unknown>,
  realId: string
): Record<string, unknown> {
  const record: Record<string, unknown> = { ...serverRecord, id: realId };

  if (
    table === "sms_transactions" &&
    local &&
    typeof local.status === "string" &&
    local.status !== "pending"
  ) {
    // User categorized/ignored this row before its INSERT synced — keep it.
    record.status = local.status;
    if (local.budget_item_id != null) {
      record.budget_item_id = local.budget_item_id;
    }
  }

  return record;
}
