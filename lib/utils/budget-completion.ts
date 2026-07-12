// Done tracks spend automatically: an item is complete exactly when its spend
// reaches its allocation. Two-way — it drops back to not-done if spend later
// falls below the planned amount. There is no manual "mark as done".
export function computeAutoCompletion(planned: number, actual: number): boolean {
  return planned > 0 && actual >= planned;
}
