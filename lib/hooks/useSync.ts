import { useSyncContext } from "@/lib/providers/SyncProvider";
import { getDB } from "@/lib/db";
import type { SyncQueueItem } from "@/lib/db";
import { trackWrite } from "@/lib/analytics/client";

/** Returns sync status values from the SyncProvider context. */
export function useSync() {
  return useSyncContext();
}

/**
 * Returns an `enqueue` function that appends a sync operation to the IDB queue
 * and triggers background processing. Safe to call from any mutation hook.
 */
export function useEnqueue() {
  const { engine } = useSyncContext();

  return async function enqueue(
    item: Omit<SyncQueueItem, "id" | "retries" | "status" | "createdAt">
  ): Promise<void> {
    trackWrite(item.table, item.operation);
    if (engine) {
      await engine.enqueue(item);
      return;
    }
    // Engine not ready yet (rare) — write directly to IDB queue
    const db = getDB();
    await db.sync_queue.add({
      ...item,
      retries: 0,
      status: "pending",
      createdAt: Date.now(),
    });
  };
}
