/**
 * Pure helpers for the editable-amount flow (allocate / reallocate of a txn).
 *
 * When a user edits a transaction's amount we must keep the budget item's
 * actual_amount in sync and preserve the originally-parsed amount the first time
 * it changes. These helpers centralize that math so the client hook and the
 * server action stay consistent (and testable in isolation).
 */

/** True when `edited` is a usable change from `current` (positive + different). */
export function isAmountEdited(
  current: number | null,
  edited: number | null | undefined,
): boolean {
  return typeof edited === "number" && edited > 0 && edited !== current;
}

/**
 * The amount to log for a categorize: the edited value when it's a real change,
 * otherwise the current parsed amount.
 */
export function effectiveAmount(
  current: number | null,
  edited: number | null | undefined,
): number | null {
  if (isAmountEdited(current, edited)) return edited as number;
  return current;
}

/**
 * The original_amount to persist. The first time the amount changes we stash the
 * pre-edit value; subsequent edits keep the already-stored original.
 */
export function nextOriginalAmount(
  current: number | null,
  storedOriginal: number | null,
  edited: number | null | undefined,
): number | null {
  if (!isAmountEdited(current, edited)) return storedOriginal;
  return storedOriginal ?? current;
}

/**
 * Delta to apply to a budget item's actual_amount when the amount changes on the
 * SAME item (new - old). Positive bumps spend, negative refunds.
 */
export function sameItemDelta(oldAmount: number, newAmount: number): number {
  return newAmount - oldAmount;
}
