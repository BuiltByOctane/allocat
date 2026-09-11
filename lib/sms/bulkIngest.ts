/**
 * Shared shape of the bulk SMS ingest round trip.
 *
 * Lives outside `lib/actions/sms.ts` because a `"use server"` module may export
 * async functions only — a constant or a type declared there breaks the build.
 */

/**
 * Upper bound on one bulk call. A backlog larger than this is split by the
 * caller (SyncEngine) into successive calls — keeps a single server action's
 * wall time bounded no matter how long the device was offline.
 */
export const MAX_BULK_INGEST = 50;

/** One entry's result inside a bulk ingest, positionally aligned to its input. */
export type BulkIngestOutcome =
  | { ok: true; result: unknown }
  | { ok: false; error: string };
