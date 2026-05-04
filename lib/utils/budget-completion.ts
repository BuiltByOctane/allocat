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
