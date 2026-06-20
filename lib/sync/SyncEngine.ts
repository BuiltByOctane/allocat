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
} from "@/lib/actions/budget";

type BulkSetupCategoryInput = {
  tempId: string;
  name: string;
  icon: string | null;
  type: "needs" | "wants" | "investments" | "misc";
  allocated_amount: number;
  items: Array<{ tempId: string; name: string; planned: number }>;
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
import {
  ingestSmsTransaction,
  categorizeSmsTransaction,
  ignoreSmsTransaction,
  deleteSmsTransaction,
  unallocateSmsTransaction,
  recategorizeSmsTransaction,
  reportSmsMistake,
  type IngestSmsInput,
  type CategorizeSmsInput,
  type RecategorizeSmsInput,
} from "@/lib/actions/sms";

const MAX_RETRIES = 3;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
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
  private handleOnline = () => this.processQueue();
  private callbacks: SyncCallbacks = {};

  // Maps each (table, operation) to the corresponding server action call
  private dispatch: Dispatcher = {
    budgets: {
      UPDATE: (p) =>
        updateBudgetTotal(p.budgetId as string, p.totalAmount as number),
      BULK_SETUP: (p) =>
        setupBudgetFromTemplate(
          p.budgetId as string,
          p.totalBudget as number,
          p.categories as BulkSetupCategoryInput[]
        ),
    },
    categories: {
      INSERT: (p) =>
        addBudgetCategory(
          p.budgetId as string,
          p.name as string,
          (p.type as "needs" | "wants" | "investments" | "misc") ?? "misc",
          (p.allocated_amount as number) ?? 0
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
          (p.emoji as string | null) ?? null
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

      while (true) {
        const items = await db.sync_queue
          .where("status")
          .equals("pending")
          .sortBy("createdAt");

        // Pick the oldest item whose dependencies are resolved. Skipping (rather
        // than halting on) a blocked item keeps one stuck op — e.g. a CATEGORIZE
        // whose INSERT failed — from freezing the entire queue behind it.
        // BULK_SETUP creates its own tempIds (not in id_map yet), so never block it.
        let item: SyncQueueItem | undefined;
        for (const candidate of items) {
          if (candidate.id === undefined) continue;
          if (
            candidate.operation !== "BULK_SETUP" &&
            (await this.hasUnresolvedDependencies(candidate))
          ) {
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
          item = candidate;
          break;
        }
        if (!item || item.id === undefined) break;

        await db.sync_queue.update(item.id, { status: "processing" });
        await this.notifyPendingChange();

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
            await db.sync_queue.update(item.id, {
              status: "pending",
              retries: nextRetries,
              lastError: errMsg,
            });
            const backoffMs = Math.pow(2, nextRetries) * 1000;
            await sleep(backoffMs);
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async hasUnresolvedDependencies(
    item: SyncQueueItem
  ): Promise<boolean> {
    const tempIds = extractTempIds(item.payload);
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
    const tempIds = extractTempIds(item.payload);
    if (tempIds.length === 0) return false;
    const db = getDB();
    for (const tempId of tempIds) {
      if (await db.id_map.get(tempId)) continue; // already resolved
      const producer = await db.sync_queue
        .filter((q) => q.tempId === tempId)
        .first();
      const live =
        producer &&
        (producer.status === "pending" || producer.status === "processing");
      if (!live) return true; // this dependency will never resolve
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

  private async executeItem(
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
  }

  private async rollback(item: SyncQueueItem): Promise<void> {
    const db = getDB();
    if (item.operation === "INSERT") {
      await db.table(item.table).delete(item.recordId);
      return;
    }
    if (item.operation === "BULK_SETUP") {
      const cats =
        (item.payload as { categories?: Array<{ tempId: string; items?: Array<{ tempId: string }> }> })
          .categories ?? [];
      for (const c of cats) {
        for (const i of c.items ?? []) {
          await db.budget_items.delete(i.tempId);
        }
        await db.categories.delete(c.tempId);
      }
    }
  }

  private async notifyPendingChange(): Promise<void> {
    if (!this.callbacks.onPendingChange) return;
    const count = await this.getPendingCount();
    this.callbacks.onPendingChange(count);
  }
}
