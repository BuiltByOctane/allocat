import { getDB, type SyncQueueItem, type SyncTable } from "@/lib/db";
import { reconcileInsertReplacement } from "@/lib/sync/reconcile";
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
  onSynced?: (item: SyncQueueItem) => void | Promise<void>;
}

export class SyncEngine {
  private isProcessing = false;
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
    window.removeEventListener("online", this.handleOnline);
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

  async getPendingCount(): Promise<number> {
    const db = getDB();
    return db.sync_queue
      .where("status")
      .anyOf(["pending", "processing"])
      .count();
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing || !navigator.onLine) return;
    this.isProcessing = true;

    try {
      const db = getDB();

      // Recover items orphaned in "processing" by a previous session that was
      // killed mid-flush. Without this they never retry and block dependents.
      await db.sync_queue
        .where("status")
        .equals("processing")
        .modify({ status: "pending" });

      // Drain in bounded-concurrency batches: each pass selects up to
      // MAX_CONCURRENCY *independent* ready items (deps resolved, one per record,
      // backoff elapsed) and runs them together. Dependents simply wait for a
      // later pass once their producer's INSERT has written id_map.
      while (true) {
        const batch = await this.selectBatch();
        if (batch.length === 0) break;

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
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Choose the next batch of ready items to run concurrently. Preserves ordering:
   * at most one item per (table, recordId) key per batch (oldest first), so two
   * ops on the same record never overlap or reorder. Dependency-blocked items are
   * skipped (and failed if doomed); backoff-deferred items are skipped until due.
   */
  private async selectBatch(): Promise<SyncQueueItem[]> {
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
      if (batch.length >= MAX_CONCURRENCY) break;
    }

    return batch;
  }

  /** Execute one queue item: resolve payload, dispatch, then map ids / retry. */
  private async processItem(item: SyncQueueItem): Promise<void> {
    if (item.id === undefined) return;
    const db = getDB();
    const resolvedPayload = await this.resolvePayload(item.payload);

    try {
      const result = await this.executeItem(item, resolvedPayload);

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

      await db.sync_queue.update(item.id, { status: "done" });
      this.callbacks.onSynced?.(item);
      await this.notifyPendingChange();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Sync failed";
      const nextRetries = item.retries + 1;

      if (nextRetries >= MAX_RETRIES) {
        await db.sync_queue.update(item.id, {
          status: "failed",
          lastError: errMsg,
        });
        await this.rollback(item);
        this.callbacks.onRollback?.(item, errMsg);
        await this.notifyPendingChange();
      } else {
        // Re-queue with a backoff deadline instead of a blocking sleep, so a
        // failing item never freezes the rest of the queue behind it.
        await db.sync_queue.update(item.id, {
          status: "pending",
          retries: nextRetries,
          lastError: errMsg,
          nextAttemptAt: Date.now() + this.retryDelayMs(nextRetries),
        });
        await this.notifyPendingChange();
      }
    }
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
