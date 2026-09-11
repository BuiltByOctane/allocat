# Delta sync + request-scoped auth — design

**Status:** proposed
**Follows:** `d042409` (batched SMS ingest, superseded-write collapsing, drain-end refresh, middleware auth skip)

## Problem

Two costs survive the batching work.

**1. Every reconcile re-downloads everything.** `hydrateAllTables()` issues 15 `select("*")` calls on cold open, on the background reconcile after a cache hit, on every foreground flip past the 5-minute staleness window, and on pull-to-refresh. A typical account moves ~1000 rows per pull (500 asset-history + 200 activity + 200 SMS + 100 feedback + the small tables) and that number only grows. Nothing about the pull depends on what actually changed.

`sync_meta.lastSynced` exists per table but is only read as a staleness boolean, and `hydrateAllTables` stamps every table with the same timestamp — so per-table freshness is currently meaningless (fault #7 in the audit).

**2. Auth fan-out inside a server action.** `ingestOne` calls `quickLogSpend`, `notifyUser`, `addAssetEntry` and `makePayment`; each creates its own Supabase client and calls `auth.getUser()` again — a network hop to Supabase Auth per nested call. A 10-message bulk ingest pays roughly 20 of them inside one invocation. That wall-clock cost is the reason `MAX_BATCH` is capped at 10 rather than 25.

## Ground truth

- `updated_at` exists on 8 tables — `profiles`, `budgets`, `categories`, `budget_items`, `assets`, `debts`, `reports`, `merchant_rules` — maintained by the `set_updated_at()` BEFORE UPDATE trigger (`supabase/migrations/20260101000000_init.sql:8`). Trigger-maintained, so every writer is covered, service role included.
- It is MISSING on `asset_categories`, `asset_value_history`, `net_worth_snapshots`, `activity_logs`, `sms_transactions`, `sms_blocklist`, `feedback` — which includes the three largest payloads.
- A delta pull cannot observe a deletion. Today deletions propagate because the payload is authoritative (`reconcileDeletes` + `RECONCILE_DELETE_TABLES`).

## Approach

Delta by `updated_at` for row payloads, plus an **id-only sweep** for deletions. No tombstone table, no DELETE triggers: the sweep is `select("id")` over the full-pull tables, a few KB, and reconciles deletes with exactly today's semantics.

### Part A — schema (one migration)

`supabase/migrations/20260912000000_delta_sync.sql`:

1. `create or replace function public.set_updated_at()` (idempotent, already exists).
2. For each of the 7 tables missing it: add `updated_at timestamptz not null default now()`, backfill from `created_at` where present else `now()`, attach the trigger, and create `index (user_id, updated_at)`.
3. Add the same index to the 8 tables that already have the column, where absent.

Additive only — no column is dropped or retyped, so an older client keeps working against the new schema (it just ignores the column).

### Part B — delta pulls

- `SyncMetaEntry` gains `watermark?: string` — the max `updated_at` **as returned by the server** for that table. Server values only; never a client clock, so skew cannot skip a row. `sync_meta` has no indexed field beyond its primary key, so this needs no Dexie version bump.
- `hydrateAllTables`: per table, `watermark ? .gte("updated_at", watermark) : <today's full/truncated query>`. `gte` (not `gt`) plus idempotent `bulkPut` means a tie at microsecond resolution re-sends one row instead of losing it.
- Truncated tables (`asset_value_history`, `net_worth_snapshots`, `activity_logs`, `sms_transactions`, `feedback`) keep their `order` + `limit` on the FIRST pull (no watermark) and use the delta filter afterwards, capped at 1000 rows.
- After a successful write, set `watermark = max(updated_at)` over the received rows; leave it unchanged when the delta is empty.
- Deletions: one `select("id")` sweep per table in `RECONCILE_DELETE_TABLES`, feeding the existing `selectRowsToDelete`. Unchanged logic, unchanged protected-id rules.
- Per-table staleness (`isTableStale`) becomes meaningful: each table stamps its own `lastSynced` after its own pull.
- Rollback: clear `watermark` from `sync_meta` and the next pull is a full one. Keep that as the recovery path for any reconcile bug.

### Part C — request-scoped auth

- `lib/supabase/server.ts`: wrap `createClient` in React `cache()` and add a cached `getAuthedUser()`.
- Replace the per-action `createClient()` + `auth.getUser()` pairs (19 files under `lib/actions/`) with it. Mechanical; no behaviour change — `cache()` is per-request, so two users can never share one.
- Then raise `MAX_BATCH` from 10 to 25 in `lib/sync/SyncEngine.ts` (`MAX_BULK_INGEST` already allows 50).

## Testing

- Pure helper `selectDeltaWatermark(rows, previous)` — max server timestamp, previous preserved on an empty delta.
- Extend `lib/db/hydrate.generation.test.ts`'s mocked-client harness: first pull is full and stores a watermark; second pull carries the `gte` filter; a row absent from the id sweep is deleted locally; a protected (in-flight) row is never deleted; a failed fetch leaves the watermark untouched.
- An auth-cache test asserting nested actions verify the user once per request.
- The 327 existing tests stay green; `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.

## Risks

| Risk | Mitigation |
|---|---|
| A write path that bypasses the trigger leaves `updated_at` stale, so the row never re-pulls | Trigger is BEFORE UPDATE on the table — covers every writer including the service role. Verify by updating a row via SQL in the dashboard. |
| Watermark advances past a row written during the fetch window | `gte` + idempotent `bulkPut`, and the existing protected-id union already covers the in-flight-mutation case. |
| Delete sweep and delta disagree mid-flight | Sweep runs in the same pass and reuses `selectRowsToDelete`, which already skips `temp_` and protected ids. |
| Migration on a large `activity_logs` | Adding a nullable-then-defaulted column with a backfill; run it off-peak and confirm row counts first. |

## Out of scope

- Tombstones / realtime subscriptions.
- Collapsing the 15 delta selects into a single RPC (a follow-up once delta is proven — the payload win lands first, the request-count win second).
- The RSC-payload measurement on server-action responses (audit item #5).
