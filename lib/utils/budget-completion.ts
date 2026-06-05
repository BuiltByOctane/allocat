// One-way auto-completion: when spend reaches the allocation, the item is
// marked done. We never auto-uncomplete — manual toggles always win.
export function computeAutoCompletion(
  planned: number,
  actual: number,
  currentCompleted: boolean
): boolean {
  if (planned > 0 && actual >= planned) return true;
  return currentCompleted;
}

// Marking an item complete means the full planned allocation is treated as
// used. Returns the actual to persist on completion: bump up to `planned`, but
// never reduce an already-higher actual (an overspend stays as-is).
export function actualOnManualComplete(planned: number, actual: number): number {
  return planned > actual ? planned : actual;
}
