/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Per-instance only (serverless spreads load across instances), so treat it as
 * abuse dampening — it caps how fast one user can brute-force prompt-injection
 * variants against the chat endpoint, not as a hard quota.
 */
type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();
const MAX_KEYS = 10_000;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    if (buckets.size > MAX_KEYS) {
      for (const [k, w] of buckets) if (now >= w.resetAt) buckets.delete(k);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}
