/**
 * Classify a failed server-action round trip.
 *
 * Transient = the request never got a verdict (offline, DNS/TLS failure, the
 * platform returned 5xx/HTML, a timeout). These must retry until they succeed;
 * dropping them loses user data. Everything else (validation, auth, "not
 * found") is a real answer and follows the bounded retry → rollback path.
 *
 * Next.js masks server-thrown error messages in production, so a masked
 * error looks permanent here — correct: the server *did* answer.
 */
const TRANSIENT_RE =
  /failed to fetch|fetch failed|load failed|network ?(error|request failed)|unexpected response was received|timed? ?out|timeout|\b50[234]\b|ECONN(RESET|REFUSED)|socket hang up|aborted/i;

export function isTransientSyncError(
  err: unknown,
  online: boolean = typeof navigator === "undefined" ? true : navigator.onLine,
): boolean {
  if (!online) return true;
  if (err instanceof TypeError) return true; // fetch() rejects with TypeError on network failure
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return TRANSIENT_RE.test(msg);
}

export const TRANSIENT_MAX_BACKOFF_MS = 5 * 60 * 1000;

export function transientBackoffMs(retries: number): number {
  return Math.min(Math.pow(2, retries) * 1000, TRANSIENT_MAX_BACKOFF_MS);
}
