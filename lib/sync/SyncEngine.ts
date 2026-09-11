import { getDB, type SyncQueueItem, type SyncTable } from "@/lib/db";
import { reconcileInsertReplacement } from "@/lib/sync/reconcile";
import { MAX_BULK_INGEST } from "@/lib/sms/bulkIngest";
import {
  addBudgetCategory,
  updateBudgetTotal,
  updateCategoryAllocation,
  updateCategoryIcon,
  updateCategoryColor,
  updateCategoryName,
  deleteCategory,
  addBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
  quickLogSpend,
  setupBudgetFromTemplate,
  carryBudgetForward,
  undoCarriedBudget,
  ensureBudgetRow,
} from "@/lib/actions/budget";
import { carryMarkerKey, type CarryPayload } from "@/lib/budget/carry";
import {
  stampBudgetTemplateIdentity,
  type StampTemplateInput,
} from "@/lib/actions/budget-templates";

type BulkSetupCategoryInput = {
  tempId: string;
  name: string;
  icon: string | null;
  type: "needs" | "wants" | "investments" | "misc";
  allocated_amount: number;
  items: Array<{
    tempId: string;
    name: string;
    planned: number;
    linkType?: "asset" | "debt" | null;
    linkId?: string | null;
    templateItemId?: string | null;
  }>;
};

type CarrySetupResult = {
  conflict: boolean;
  budgetIdMap: {
    tempId: string | null;
    realId: string;
    record: Record<string, unknown>;
  } | null;
  categoryIdMap: Array<{
    tempId: string;
    realId: string;
    record: Record<string, unknown>;
  }>;
  itemIdMap: Array<{
    tempId: string;
    realId: string;
    record: Record<string, unknown>;
  }>;
};
import {
  addAsset,
  updateAsset,
  deleteAsset,
  achieveGoalAsset,
} from "@/lib/actions/net-worth";
import {
  addAssetCategory,
  updateAssetCategory,
  deleteAssetCategory,
} from "@/lib/actions/asset-categories";
import { addAssetEntry } from "@/lib/actions/asset-history";
import {
  addDebt,
  updateDebt,
  deleteDebt,
  makePayment,
} from "@/lib/actions/debt";
import { upsertReport, type UpsertReportInput } from "@/lib/actions/reports";
import {
  ingestSmsTransaction,
  ingestSmsTransactionsBulk,
  categorizeSmsTransaction,
  ignoreSmsTransaction,
  deleteSmsTransaction,
  unallocateSmsTransaction,
  recategorizeSmsTransaction,
  reportSmsMistake,
  deleteBlocklistEntry,
  type IngestSmsInput,
  type CategorizeSmsInput,
  type RecategorizeSmsInput,
} from "@/lib/actions/sms";

const MAX_RETRIES = 3;

// Independent queue items (distinct records, no unresolved temp-id deps) drain
// concurrently up to this many at once. Kept modest to avoid hammering Supabase
// / server-action limits.
const MAX_CONCURRENCY = 4;

// Queue items of a batchable (table, operation) travel to the server together,
// this many per round trip. Must stay ≤ the server action's own cap
// (MAX_BULK_INGEST) — a larger group is split across successive calls.
//
// The bulk ingest runs its items SEQUENTIALLY server-side (two SMS can touch
// the same budget item), so this is really a wall-clock budget for one
// serverless invocation. It was 10 while every nested action re-verified the
// user over the network; with request-scoped auth (getAuthedUser) that cost is
// gone, so a 40-message backlog is 2 requests instead of 40.
const MAX_BATCH = Math.min(25, MAX_BULK_INGEST);

/** Result of one entry inside a bulk round trip. */
type BatchOutcome = { ok: true; result: unknown } | { ok: false; error: string };

/** Identity of a (table, operation) pair — the batching / collapsing key. */
function opKey(item: SyncQueueItem): string {
  return `${item.table}:${item.operation}`;
}

/**
 * Tables whose plain `UPDATE` writes an ABSOLUTE field value (not a delta), so
 * an older queued UPDATE of the same fields is provably overwritten by a newer
 * one and can be dropped unsent. Delta-bearing operations (PAYMENT, CATEGORIZE,
 * ACHIEVE, the bulk setups) are never collapsed — only `UPDATE`.
 */
const COLLAPSIBLE_UPDATE_TABLES = new Set<string>([
  "budgets",
  "categories",
  "budget_items",
  "assets",
  "debts",
  "asset_categories",
]);

/**
 * Fields excluded from collapsing even on a collapsible table.
 * `actual_amount` cascades server-side into a linked asset/debt and writes an
 * activity-log entry per call — collapsing would silently rewrite that history.
 */
const NON_COLLAPSIBLE_FIELDS = new Set<string>(["actual_amount"]);

/**
 * Which fields an UPDATE writes, as a stable signature. `null` means "not
 * collapsible" (unknown shape, or a field we refuse to collapse).
 *
 * Payloads come in two shapes: a nested `updates` object (most tables) or flat
 * arguments (e.g. budgets `{ budgetId, totalAmount }`). Both are absolute
 * writes, so the signature is just the sorted key list.
 */
function updateSignature(item: SyncQueueItem): string | null {
  if (item.operation !== "UPDATE") return null;
  if (!COLLAPSIBLE_UPDATE_TABLES.has(item.table)) return null;

  const payload = item.payload as Payload;
  const nested = payload.updates;
  const fields =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? Object.keys(nested as Payload)
      : Object.keys(payload);
  if (fields.length === 0) return null;
  if (fields.some((f) => NON_COLLAPSIBLE_FIELDS.has(f))) return null;

  return `${item.table}|${fields.slice().sort().join(",")}`;
}

/**
 * Ids of queue items made redundant by a LATER write of the same fields to the
 * same record — the classic "user dragged the slider five times offline" case,
 * which used to cost five server round trips to reach one final value.
 *
 * Deliberately conservative:
 *   - only `pending` items (a `processing` item is already in flight);
 *   - only ADJACENT items per record — any other operation in between (a
 *     PAYMENT, a DELETE) ends the run, since the later write may depend on what
 *     that operation did;
 *   - only an IDENTICAL field signature, so an earlier `{name}` edit is never
 *     swallowed by a later `{allocated_amount}` one.
 *
 * Exported for unit testing.
 */
export function selectSupersededIds(items: SyncQueueItem[]): number[] {
  const byRecord = new Map<string, SyncQueueItem[]>();
  for (const item of items) {
    if (item.id === undefined) continue;
    if (item.status !== "pending") continue;
    const key = `${item.table}:${item.recordId}`;
    const list = byRecord.get(key) ?? [];
    list.push(item);
    byRecord.set(key, list);
  }

  const superseded: number[] = [];
  for (const list of byRecord.values()) {
    const ordered = list.slice().sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 0; i < ordered.length - 1; i++) {
      const sig = updateSignature(ordered[i]);
      if (sig === null) continue;
      // Only the IMMEDIATELY following item may supersede this one.
      if (updateSignature(ordered[i + 1]) !== sig) continue;
      superseded.push(ordered[i].id as number);
    }
  }
  return superseded;
}

function extractTempIds(obj: unknown): string[] {
  const ids: string[] = [];
  const walk = (o: unknown) => {
    if (typeof o === "string" && o.startsWith("temp_")) ids.push(o);
    else if (o && typeof o === "object")
      Object.values(o as object).forEach(walk);
  };
  walk(obj);
  return ids;
}

/** Ops whose payload nests its own tempIds under categories[]/items[]. */
function isNestedBulkOp(op: SyncQueueItem["operation"]): boolean {
  return op === "BULK_SETUP" || op === "CARRY_SETUP";
}

/**
 * BULK_SETUP / CARRY_SETUP enqueue with `recordId: budgetId` and NO top-level
 * `tempId` — the temp ids they create live inside `payload.categories[].tempId`
 * and `…items[].tempId` (CARRY_SETUP may also declare `payload.budgetTempId`).
 * So a plain `q.tempId === id` producer lookup never matches them. This
 * recognises a nested-bulk item as the producer for any temp id it declares, so
 * dependents (SMS categorize, quick-spend, auto-allocate on a freshly-created
 * budget item) aren't wrongly judged doomed if the queue is ever evaluated out
 * of insertion order.
 */
function bulkSetupDeclares(item: SyncQueueItem, tempId: string): boolean {
  if (!isNestedBulkOp(item.operation)) return false;
  const payload = item.payload as {
    budgetTempId?: string | null;
    categories?: Array<{ tempId?: string; items?: Array<{ tempId?: string }> }>;
  };
  if (payload.budgetTempId === tempId) return true;
  for (const c of payload.categories ?? []) {
    if (c.tempId === tempId) return true;
    for (const i of c.items ?? []) {
      if (i.tempId === tempId) return true;
    }
  }
  return false;
}

type Payload = Record<string, unknown>;
type Dispatcher = Record<
  string,
  Record<string, (p: Payload) => Promise<unknown>>
>;

interface SyncCallbacks {
  onPendingChange?: (count: number) => void;
  onRollback?: (item: SyncQueueItem, error: string) => void;
  /**
   * One successful sync. For a batched group this fires ONCE, with the group's
   * first item as the representative — the consumer uses it to decide which
   * tables to re-pull, and re-pulling once per group is the whole point.
   */
  onSynced?: (item: SyncQueueItem) => void | Promise<void>;
  /**
   * The queue reached a resting point (empty, or only backoff-deferred items).
   * Lets the consumer run its post-sync refresh ONCE for a whole backlog
   * instead of once per drain pass.
   */
  onDrainEnd?: () => void;
}

export class SyncEngine {
  private isProcessing = false;
  private activeDrain: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private handleOnline = () => this.processQueue();
  private callbacks: SyncCallbacks = {};

  // Maps each (table, operation) to the corresponding server action call
  private dispatch: Dispatcher = {
    budgets: {
      // Offline-created month row: create-or-get resolves the temp id.
      INSERT: (p) => ensureBudgetRow(p.month as number, p.year as number),
      UPDATE: (p) =>
        updateBudgetTotal(p.budgetId as string, p.totalAmount as number),
      BULK_SETUP: (p) =>
        setupBudgetFromTemplate(
          p.budgetId as string,
          p.totalBudget as number,
          p.categories as BulkSetupCategoryInput[],
          (p.templateId as string | null) ?? null
        ),
      STAMP_TEMPLATE: (p) =>
        stampBudgetTemplateIdentity(p as unknown as StampTemplateInput),
      CARRY_SETUP: (p) => carryBudgetForward(p as unknown as CarryPayload),
      UNDO_CARRY: (p) => undoCarriedBudget(p.budgetId as string),
    },
    categories: {
      INSERT: (p) =>
        addBudgetCategory(
          p.budgetId as string,
          p.name as string,
          (p.type as "needs" | "wants" | "investments" | "misc") ?? "misc",
          (p.allocated_amount as number) ?? 0,
          (p.icon as string | null) ?? null
        ),
      UPDATE: (p) => {
        const u = p.updates as Record<string, unknown>;
        if (u.icon !== undefined)
          return updateCategoryIcon(p.categoryId as string, u.icon as string);
        if (u.color !== undefined)
          return updateCategoryColor(p.categoryId as string, u.color as string | null);
        if (u.name !== undefined)
          return updateCategoryName(p.categoryId as string, u.name as string);
        if (u.allocated_amount !== undefined)
          return updateCategoryAllocation(
            p.categoryId as string,
            u.allocated_amount as number
          );
        return Promise.reject(new Error("Unknown category update payload"));
      },
      DELETE: (p) => deleteCategory(p.categoryId as string),
    },
    budget_items: {
      INSERT: (p) =>
        addBudgetItem(
          p.categoryId as string,
          p.name as string,
          (p.planned as number) ?? 0,
          (p.link as { link_type: "asset" | "debt"; link_id: string } | null) ?? null,
          (p.emoji as string | null) ?? null,
          (p.template as { template_id: string | null; template_item_id: string | null } | null) ?? null
        ),
      UPDATE: (p) =>
        updateBudgetItem(
          p.itemId as string,
          p.updates as Parameters<typeof updateBudgetItem>[1]
        ),
      DELETE: (p) => deleteBudgetItem(p.itemId as string),
      PAYMENT: (p) => quickLogSpend(p.itemId as string, p.amount as number),
    },
    assets: {
      INSERT: (p) =>
        addAsset(
          p.name as string,
          (p.categoryId as string | null) ?? null,
          p.value as number,
          (p.icon as string | null) ?? null,
          {
            isGoal: Boolean(p.isGoal),
            targetAmount: (p.targetAmount as number | null | undefined) ?? null,
          }
        ),
      UPDATE: (p) =>
        updateAsset(
          p.id as string,
          p.updates as Parameters<typeof updateAsset>[1]
        ),
      DELETE: (p) => deleteAsset(p.id as string),
      ACHIEVE: (p) => achieveGoalAsset(p.id as string),
    },
    asset_categories: {
      INSERT: (p) =>
        addAssetCategory(p.name as string, p.icon as string),
      UPDATE: (p) =>
        updateAssetCategory(p.id as string, p.updates as { name?: string; icon?: string }),
      DELETE: (p) => deleteAssetCategory(p.id as string),
    },
    asset_value_history: {
      INSERT: (p) =>
        addAssetEntry(
          p.assetId as string,
          p.entryType as "initial" | "add_funds" | "withdraw" | "update_value",
          p.amount as number,
          (p.note as string | null) ?? null,
          (p.entryDate as string | undefined)
        ),
    },
    debts: {
      INSERT: (p) =>
        addDebt(
          p.name as string,
          p.type as "internal" | "external" | "lent",
          p.principal as number,
          p.interestRate as number,
          p.monthlyMin as number,
          (p.expectedPayoffDate as string | null) ?? null
        ),
      UPDATE: (p) =>
        updateDebt(
          p.id as string,
          p.updates as Parameters<typeof updateDebt>[1]
        ),
      DELETE: (p) => deleteDebt(p.id as string),
      PAYMENT: (p) => makePayment(p.id as string, p.amount as number),
    },
    reports: {
      // Notes-save is an upsert: both INSERT and UPDATE route to upsertReport,
      // which resolves the (user_id, month, year) row server-side.
      INSERT: (p) =>
        upsertReport({
          budgetId: p.budgetId as string,
          month: p.month as number,
          year: p.year as number,
          notes: (p.notes as string) ?? "",
          summaryData: p.summaryData as UpsertReportInput["summaryData"],
        }),
      UPDATE: (p) =>
        upsertReport({
          budgetId: p.budgetId as string,
          month: p.month as number,
          year: p.year as number,
          notes: (p.notes as string) ?? "",
          summaryData: p.summaryData as UpsertReportInput["summaryData"],
        }),
    },
    sms_transactions: {
      INSERT: (p) => ingestSmsTransaction(p as unknown as IngestSmsInput),
      CATEGORIZE: (p) =>
        categorizeSmsTransaction(p as unknown as CategorizeSmsInput),
      IGNORE: (p) => ignoreSmsTransaction(p.txnId as string),
      DELETE: (p) => deleteSmsTransaction(p.txnId as string),
      UNALLOCATE: (p) => unallocateSmsTransaction(p.txnId as string),
      RECATEGORIZE: (p) =>
        recategorizeSmsTransaction(p as unknown as RecategorizeSmsInput),
    },
    sms_blocklist: {
      INSERT: (p) =>
        reportSmsMistake(
          p as unknown as {
            txnId: string;
            templateKey: string;
            sampleLabel?: string | null;
          },
        ),
      DELETE: (p) => deleteBlocklistEntry(p.id as string),
    },
  };

  /**
   * (table, operation) pairs that travel to the server in ONE call.
   *
   * A device that was closed for a day comes back with a queue full of SMS
   * INSERTs; sending them one at a time meant one request (and one auth round
   * trip) per message. The per-item semantics are unchanged — the bulk action
   * runs the same ingest sequentially server-side and returns one outcome per
   * input, so a single bad message still retries alone.
   */
  private bulkDispatch: Record<
    string,
    (payloads: Payload[]) => Promise<BatchOutcome[]>
  > = {
    "sms_transactions:INSERT": (payloads) =>
      ingestSmsTransactionsBulk(payloads as unknown as IngestSmsInput[]),
  };

  /**
   * Register (or clear) runtime callbacks.
   * Called from the SyncProvider effect — safe to call at any time.
   */
  setCallbacks(cbs: SyncCallbacks): void {
    this.callbacks = cbs;
  }

  start(): void {
    window.addEventListener("online", this.handleOnline);
    if (navigator.onLine) this.processQueue();
  }

  stop(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.callbacks = {};
  }

  async enqueue(
    item: Omit<SyncQueueItem, "id" | "retries" | "status" | "createdAt">
  ): Promise<void> {
    const db = getDB();
    await db.sync_queue.add({
      ...item,
      retries: 0,
      status: "pending",
      createdAt: Date.now(),
    });
    await this.notifyPendingChange();
    if (navigator.onLine && !this.isProcessing) {
      this.processQueue();
    }
  }

  /** True while a drain pass is running — consumers use it to defer refreshes. */
  get isDraining(): boolean {
    return this.isProcessing;
  }

  async getPendingCount(): Promise<number> {
    const db = getDB();
    return db.sync_queue
      .where("status")
      .anyOf(["pending", "processing"])
      .count();
  }

  async processQueue(): Promise<void> {
    if (!navigator.onLine) return;
    // A drain is already running — await it rather than starting a second one,
    // so external callers (e.g. flush() on logout) block until it finishes.
    if (this.isProcessing) {
      if (this.activeDrain) await this.activeDrain;
      return;
    }
    this.isProcessing = true;

    const drain = (async () => {
      try {
        const db = getDB();

        // Recover items orphaned in "processing" by a previous session that was
        // killed mid-flush. Without this they never retry and block dependents.
        await db.sync_queue
          .where("status")
          .equals("processing")
          .modify({ status: "pending" });

        // Drain in passes. Each pass looks at every READY item (deps resolved,
        // one per record, backoff elapsed) and either:
        //   - sends a batchable group (e.g. queued SMS INSERTs) in ONE round
        //     trip, or
        //   - runs up to MAX_CONCURRENCY independent items in parallel.
        // Dependents simply wait for a later pass once their producer's INSERT
        // has written id_map.
        while (true) {
          // Redundant writes are dropped before anything is sent.
          await this.collapseSuperseded();

          const ready = await this.scanReady();
          if (ready.length === 0) break;

          const group = this.pickBulkGroup(ready);
          if (group) {
            await this.processBulkGroup(group);
            continue;
          }

          const batch = ready.slice(0, MAX_CONCURRENCY);
          await Promise.all(
            batch.map((item) =>
              db.sync_queue.update(item.id as number, { status: "processing" })
            )
          );
          await this.notifyPendingChange();

          // processItem swallows its own errors, so allSettled never rejects.
          await Promise.allSettled(batch.map((item) => this.processItem(item)));
        }
      } finally {
        this.isProcessing = false;
      }

      // Anything left pending is backoff-deferred — wake once when the soonest is due.
      await this.scheduleRetryWake();
      // Queue is at rest: one refresh for the whole backlog.
      this.callbacks.onDrainEnd?.();
    })();

    this.activeDrain = drain;
    try {
      await drain;
    } finally {
      this.activeDrain = null;
    }
  }

  /**
   * Best-effort synchronous drain of the queue. Used BEFORE a logout wipe
   * (`clearClientSession` → `clearDB`) so freshly-enqueued ops — notably an SMS
   * `CATEGORIZE` the user just did — reach the server while the current session
   * is still valid. Without this the wipe destroys the queue and the allocation
   * is lost, reappearing as `pending` after re-hydration. Never throws; no-op
   * when offline (the wipe still proceeds — allocation stays local-only).
   */
  async flush(): Promise<void> {
    try {
      await this.processQueue();
    } catch {
      /* best effort — never block logout on a sync failure */
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Drop queue items that a later write has already made redundant (see
   * selectSupersededIds). Runs before every pass so writes enqueued DURING a
   * long drain are collapsed too.
   */
  private async collapseSuperseded(): Promise<void> {
    const db = getDB();
    const pending = await db.sync_queue
      .where("status")
      .equals("pending")
      .toArray();
    const ids = selectSupersededIds(pending);
    if (ids.length === 0) return;
    for (const id of ids) await db.sync_queue.delete(id);
    await this.notifyPendingChange();
  }

  /**
   * The largest batchable group among the ready items, or null when there isn't
   * one worth batching. A lone item takes the normal single-dispatch path —
   * wrapping one message in a bulk call would only obscure its error.
   *
   * Records are independent by construction here (scanReady admits at most one
   * item per record), so grouping never reorders two writes to the same row.
   */
  private pickBulkGroup(ready: SyncQueueItem[]): SyncQueueItem[] | null {
    const groups = new Map<string, SyncQueueItem[]>();
    for (const item of ready) {
      const key = opKey(item);
      if (!this.bulkDispatch[key]) continue;
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }

    let best: SyncQueueItem[] | null = null;
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      if (!best || list.length > best.length) best = list;
    }
    return best ? best.slice(0, MAX_BATCH) : null;
  }

  /**
   * Send a batchable group in one round trip, then reconcile each item exactly
   * as the single path would. A per-item error retries only that item; a failed
   * round trip retries all of them.
   */
  private async processBulkGroup(group: SyncQueueItem[]): Promise<void> {
    const db = getDB();
    const payloads = await Promise.all(
      group.map((item) => this.resolvePayload(item.payload))
    );

    await Promise.all(
      group.map((item) =>
        db.sync_queue.update(item.id as number, { status: "processing" })
      )
    );
    await this.notifyPendingChange();

    let outcomes: BatchOutcome[];
    try {
      outcomes = await this.executeBatch(group, payloads);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bulk sync failed";
      for (const item of group) await this.applyFailure(item, msg);
      await this.notifyPendingChange();
      return;
    }

    let anySynced = false;
    for (let i = 0; i < group.length; i++) {
      const outcome = outcomes?.[i];
      if (!outcome || outcome.ok !== true) {
        await this.applyFailure(
          group[i],
          outcome && outcome.ok === false
            ? outcome.error
            : "Bulk sync returned no result for this item"
        );
        continue;
      }
      try {
        await this.applySuccess(group[i], outcome.result);
        anySynced = true;
      } catch (err) {
        await this.applyFailure(
          group[i],
          err instanceof Error ? err.message : "Sync failed"
        );
      }
    }

    // ONE onSynced for the group — the consumer re-pulls affected tables from
    // it, and doing that per item is exactly the storm this batching removes.
    if (anySynced) this.callbacks.onSynced?.(group[0]);
    await this.notifyPendingChange();
  }

  /**
   * Every item that may run right now, oldest first. Preserves ordering: at most
   * one item per (table, recordId) key (oldest wins), so two ops on the same
   * record never overlap or reorder. Dependency-blocked items are skipped (and
   * failed if doomed); backoff-deferred items are skipped until due.
   */
  private async scanReady(limit = MAX_BATCH): Promise<SyncQueueItem[]> {
    const db = getDB();
    const items = await db.sync_queue
      .where("status")
      .equals("pending")
      .sortBy("createdAt");

    const now = Date.now();
    const batch: SyncQueueItem[] = [];
    const claimedKeys = new Set<string>();

    for (const candidate of items) {
      if (candidate.id === undefined) continue;

      // Retry backoff not yet elapsed → leave for a later wake.
      if (candidate.nextAttemptAt && candidate.nextAttemptAt > now) continue;

      // Nested bulk ops create their own tempIds (not in id_map yet) — only
      // EXTERNAL temp refs (e.g. a carried linkId / stampSourceItemId pointing
      // at a still-unsynced row) should gate them on their producer.
      if (await this.hasUnresolvedDependencies(candidate)) {
        // If the dependency can never resolve (its INSERT failed and is gone),
        // this item is doomed — fail it so it stops clogging the queue count.
        if (await this.isDependencyDoomed(candidate)) {
          await db.sync_queue.update(candidate.id, {
            status: "failed",
            lastError: "dependency never synced",
          });
          await this.rollback(candidate);
          this.callbacks.onRollback?.(candidate, "dependency never synced");
          await this.notifyPendingChange();
        }
        continue;
      }

      // Serialize ops on the same record: admit only the oldest per key per batch.
      const key = `${candidate.table}:${candidate.recordId}`;
      if (claimedKeys.has(key)) continue;
      claimedKeys.add(key);

      batch.push(candidate);
      // A full bulk group (or a full concurrency slice) is all a pass can use;
      // scanning the rest of a long backlog every pass is wasted work.
      if (batch.length >= limit) break;
    }

    return batch;
  }

  /** Execute one queue item: resolve payload, dispatch, then map ids / retry. */
  private async processItem(item: SyncQueueItem): Promise<void> {
    if (item.id === undefined) return;
    const resolvedPayload = await this.resolvePayload(item.payload);

    try {
      const result = await this.executeItem(item, resolvedPayload);
      await this.applySuccess(item, result);
      this.callbacks.onSynced?.(item);
      await this.notifyPendingChange();
    } catch (err) {
      await this.applyFailure(
        item,
        err instanceof Error ? err.message : "Sync failed"
      );
      await this.notifyPendingChange();
    }
  }

  /**
   * Reconcile ONE successful round trip: temp→real id mapping, nested bulk-setup
   * results, and marking the item done. Shared by the single and batched paths;
   * neither `onSynced` nor the pending-count notification happens here, because
   * a batch emits those once for the whole group.
   */
  private async applySuccess(
    item: SyncQueueItem,
    result: unknown
  ): Promise<void> {
    const db = getDB();
    {
      if (item.operation === "INSERT" && item.tempId) {
        const realId = (result as Record<string, unknown>)?.id as
          | string
          | undefined;
        if (realId && realId !== item.tempId) {
          await db.id_map.put({
            tempId: item.tempId,
            realId,
            table: item.table,
          });
          await this.replaceIDBRecord(
            item.table,
            item.tempId,
            realId,
            result as Record<string, unknown>
          );
        }
      } else if (item.operation === "BULK_SETUP") {
        await this.applyBulkSetupResult(
          result as {
            categoryIdMap: Array<{
              tempId: string;
              realId: string;
              record: Record<string, unknown>;
            }>;
            itemIdMap: Array<{
              tempId: string;
              realId: string;
              record: Record<string, unknown>;
            }>;
          }
        );
      } else if (item.operation === "CARRY_SETUP") {
        await this.applyCarrySetupResult(item, result as CarrySetupResult);
      }
    }

    await db.sync_queue.update(item.id as number, { status: "done" });
  }

  /**
   * Handle ONE failed round trip: retry with backoff, or — out of retries —
   * fail permanently and roll the optimistic state back.
   */
  private async applyFailure(
    item: SyncQueueItem,
    errMsg: string
  ): Promise<void> {
    const db = getDB();
    const nextRetries = item.retries + 1;

    if (nextRetries >= MAX_RETRIES) {
      await db.sync_queue.update(item.id as number, {
        status: "failed",
        lastError: errMsg,
      });
      await this.rollback(item);
      this.callbacks.onRollback?.(item, errMsg);
      return;
    }

    // Re-queue with a backoff deadline instead of a blocking sleep, so a
    // failing item never freezes the rest of the queue behind it.
    await db.sync_queue.update(item.id as number, {
      status: "pending",
      retries: nextRetries,
      lastError: errMsg,
      nextAttemptAt: Date.now() + this.retryDelayMs(nextRetries),
    });
  }

  /** Backoff before a retry. Overridable in tests. */
  protected retryDelayMs(retries: number): number {
    return Math.pow(2, retries) * 1000;
  }

  /**
   * After a drain settles, schedule a single wake for the soonest backoff-deferred
   * item so its retry actually fires (nothing else re-kicks the queue otherwise).
   */
  private async scheduleRetryWake(): Promise<void> {
    const db = getDB();
    const pending = await db.sync_queue
      .where("status")
      .equals("pending")
      .toArray();

    const now = Date.now();
    const dueTimes = pending
      .map((p) => p.nextAttemptAt ?? 0)
      .filter((t) => t > now);
    if (dueTimes.length === 0) return;

    const wait = Math.max(0, Math.min(...dueTimes) - now);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.processQueue();
    }, wait);
  }

  /**
   * Temp ids in the payload the item depends on someone ELSE to produce.
   * Nested bulk ops (BULK_SETUP/CARRY_SETUP) declare their own temp ids —
   * those are excluded, leaving only external refs (linkId, stampSourceItemId).
   */
  private dependencyTempIds(item: SyncQueueItem): string[] {
    const tempIds = extractTempIds(item.payload);
    if (!isNestedBulkOp(item.operation)) return tempIds;
    return tempIds.filter((id) => !bulkSetupDeclares(item, id));
  }

  private async hasUnresolvedDependencies(
    item: SyncQueueItem
  ): Promise<boolean> {
    const tempIds = this.dependencyTempIds(item);
    if (tempIds.length === 0) return false;
    const db = getDB();
    for (const tempId of tempIds) {
      const mapping = await db.id_map.get(tempId);
      if (!mapping) return true;
    }
    return false;
  }

  /**
   * True when at least one unresolved temp id in the payload has no live
   * producer left — i.e. the INSERT that would map it is neither already
   * mapped nor still pending/processing (it failed and was removed). Such an
   * item can never sync, so it should be failed rather than blocked forever.
   */
  private async isDependencyDoomed(item: SyncQueueItem): Promise<boolean> {
    const tempIds = this.dependencyTempIds(item);
    if (tempIds.length === 0) return false;
    const db = getDB();
    for (const tempId of tempIds) {
      if (await db.id_map.get(tempId)) continue; // already resolved
      const producer = await db.sync_queue
        .filter(
          (q) =>
            (q.tempId === tempId || bulkSetupDeclares(q, tempId)) &&
            (q.status === "pending" || q.status === "processing")
        )
        .first();
      if (!producer) return true; // this dependency will never resolve
    }
    return false;
  }

  private async resolvePayload(payload: Payload): Promise<Payload> {
    const db = getDB();
    const resolve = async (obj: unknown): Promise<unknown> => {
      if (typeof obj === "string" && obj.startsWith("temp_")) {
        const mapping = await db.id_map.get(obj);
        return mapping ? mapping.realId : obj;
      }
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        const out: Payload = {};
        for (const [k, v] of Object.entries(obj as Payload)) {
          out[k] = await resolve(v);
        }
        return out;
      }
      if (Array.isArray(obj)) return Promise.all(obj.map(resolve));
      return obj;
    };
    return resolve(payload) as Promise<Payload>;
  }

  /** Overridable in tests to instrument the single server-action round trip. */
  protected async executeItem(
    item: SyncQueueItem,
    resolvedPayload: Payload
  ): Promise<unknown> {
    const tableDispatch = this.dispatch[item.table];
    if (!tableDispatch)
      throw new Error(`No dispatch registered for table: ${item.table}`);
    const opDispatch = tableDispatch[item.operation];
    if (!opDispatch)
      throw new Error(
        `No dispatch for ${item.operation} on ${item.table}`
      );
    return opDispatch(resolvedPayload);
  }

  /**
   * Overridable in tests to instrument the bulk round trip. Returns one outcome
   * per input, in order.
   */
  protected async executeBatch(
    items: SyncQueueItem[],
    payloads: Payload[]
  ): Promise<BatchOutcome[]> {
    const key = opKey(items[0]);
    const bulk = this.bulkDispatch[key];
    if (!bulk) throw new Error(`No bulk dispatch registered for ${key}`);
    return bulk(payloads);
  }

  private async applyBulkSetupResult(result: {
    categoryIdMap: Array<{
      tempId: string;
      realId: string;
      record: Record<string, unknown>;
    }>;
    itemIdMap: Array<{
      tempId: string;
      realId: string;
      record: Record<string, unknown>;
    }>;
  }): Promise<void> {
    const db = getDB();

    for (const m of result.categoryIdMap || []) {
      if (m.realId === m.tempId) continue;
      await db.id_map.put({
        tempId: m.tempId,
        realId: m.realId,
        table: "categories",
      });
      await this.replaceIDBRecord(
        "categories",
        m.tempId,
        m.realId,
        m.record
      );
    }

    for (const m of result.itemIdMap || []) {
      if (m.realId === m.tempId) continue;
      await db.id_map.put({
        tempId: m.tempId,
        realId: m.realId,
        table: "budget_items",
      });
      await this.replaceIDBRecord(
        "budget_items",
        m.tempId,
        m.realId,
        m.record
      );
    }
  }

  /**
   * Reconcile a CARRY_SETUP round trip.
   * Success: swap the optimistic budget row (when carried offline against no
   * local row) then reuse the BULK_SETUP category/item reconciliation.
   * Conflict (another device/tab populated the month first): drop our
   * optimistic rows, hydrate the winner's budget row, clear the carry marker
   * so the banner doesn't advertise a carry that didn't happen.
   */
  private async applyCarrySetupResult(
    item: SyncQueueItem,
    result: CarrySetupResult
  ): Promise<void> {
    const db = getDB();
    const payload = item.payload as unknown as CarryPayload;

    if (result.conflict) {
      // Delete our optimistic nested rows (same shape as rollback).
      for (const c of payload.categories ?? []) {
        for (const i of c.items ?? []) {
          await db.budget_items.delete(i.tempId);
        }
        await db.categories.delete(c.tempId);
      }
      if (result.budgetIdMap) {
        if (payload.budgetTempId) {
          await db.budgets.delete(payload.budgetTempId);
          await db.id_map.put({
            tempId: payload.budgetTempId,
            realId: result.budgetIdMap.realId,
            table: "budgets",
          });
        }
        await db.budgets.put(result.budgetIdMap.record as never);
      }
      await db.sync_meta.delete(carryMarkerKey(payload.month, payload.year));
      return;
    }

    if (result.budgetIdMap) {
      if (
        result.budgetIdMap.tempId &&
        result.budgetIdMap.tempId !== result.budgetIdMap.realId
      ) {
        await db.id_map.put({
          tempId: result.budgetIdMap.tempId,
          realId: result.budgetIdMap.realId,
          table: "budgets",
        });
        await this.replaceIDBRecord(
          "budgets",
          result.budgetIdMap.tempId,
          result.budgetIdMap.realId,
          result.budgetIdMap.record
        );
      } else {
        // Row id was already real — refresh it with the server's stamped state.
        await db.budgets.put(result.budgetIdMap.record as never);
      }
    }

    await this.applyBulkSetupResult(result);
  }

  private async replaceIDBRecord(
    table: SyncTable,
    tempId: string,
    realId: string,
    serverRecord: Record<string, unknown>
  ): Promise<void> {
    const db = getDB();
    const tbl = db.table(table);
    // Read the local row first: it may carry optimistic state the user advanced
    // after the optimistic insert (e.g. an sms_transaction categorized before
    // its INSERT synced) that the server's INSERT response predates.
    const local = (await tbl.get(tempId)) as
      | Record<string, unknown>
      | undefined;
    await tbl.delete(tempId);
    await tbl.put(
      reconcileInsertReplacement(table, local, serverRecord, realId)
    );
    // A parent INSERT just swapped temp→real. Any sibling IDB rows still holding
    // the temp id as a foreign key (child rows inserted before the parent synced)
    // would orphan — reads query by the real id and the child vanishes until its
    // own INSERT drains. Rewrite those FKs now. Outgoing payloads are handled
    // separately by resolvePayload; this fixes rows already sitting in IDB.
    await this.rewriteChildForeignKeys(table, tempId, realId);
  }

  /** Repoint child IDB foreign keys after a parent temp→real id swap. */
  private async rewriteChildForeignKeys(
    table: SyncTable,
    tempId: string,
    realId: string
  ): Promise<void> {
    const db = getDB();
    if (table === "budgets") {
      // budget_id is indexed on categories — use it.
      const kids = await db.categories
        .where("budget_id")
        .equals(tempId)
        .toArray();
      for (const k of kids) {
        await db.categories.update(k.id, { budget_id: realId });
      }
    } else if (table === "categories") {
      // category_id is indexed on budget_items — use it.
      const kids = await db.budget_items
        .where("category_id")
        .equals(tempId)
        .toArray();
      for (const k of kids) {
        await db.budget_items.update(k.id, { category_id: realId });
      }
    } else if (table === "asset_categories") {
      const kids = await db.assets
        .filter((a) => a.category_id === tempId)
        .toArray();
      for (const k of kids) {
        await db.assets.update(k.id, { category_id: realId });
      }
    } else if (table === "assets" || table === "debts") {
      // budget_items can link to either an asset or a debt via link_id.
      const kids = await db.budget_items
        .filter((i) => i.link_id === tempId)
        .toArray();
      for (const k of kids) {
        await db.budget_items.update(k.id, { link_id: realId });
      }
    }
  }

  private async rollback(item: SyncQueueItem): Promise<void> {
    const db = getDB();
    if (item.operation === "INSERT") {
      await db.table(item.table).delete(item.recordId);
      return;
    }
    if (isNestedBulkOp(item.operation)) {
      const payload = item.payload as {
        categories?: Array<{ tempId: string; items?: Array<{ tempId: string }> }>;
        budgetTempId?: string | null;
        month?: number;
        year?: number;
      };
      for (const c of payload.categories ?? []) {
        for (const i of c.items ?? []) {
          await db.budget_items.delete(i.tempId);
        }
        await db.categories.delete(c.tempId);
      }
      if (item.operation === "CARRY_SETUP") {
        if (payload.budgetTempId) {
          await db.budgets.delete(payload.budgetTempId);
        }
        if (payload.month && payload.year) {
          await db.sync_meta.delete(carryMarkerKey(payload.month, payload.year));
        }
      }
    }
  }

  private async notifyPendingChange(): Promise<void> {
    if (!this.callbacks.onPendingChange) return;
    const count = await this.getPendingCount();
    this.callbacks.onPendingChange(count);
  }
}
