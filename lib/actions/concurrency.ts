/**
 * Optimistic-concurrency loop for read-modify-write counters. `fn` reads the
 * current row, computes the new value and issues an UPDATE filtered on the
 * value it read (e.g. `.eq("actual_amount", previous)`). PostgREST returns no
 * row when another writer got there first — return `null` and we re-read.
 *
 * No `import "server-only"` here (deliberately — see controller ruling in the
 * task brief): `lib/actions/reverse-spend.test.ts` imports `budget.ts` under
 * vitest without mocking `server-only`, and this helper is a pure retry loop
 * with nothing secret in it. It's only ever imported from `"use server"` files.
 */
export async function withCas<T>(
  attempts: number,
  fn: () => Promise<T | null>,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    const out = await fn();
    if (out !== null) return out;
  }
  throw new Error("Concurrent update, please retry");
}
