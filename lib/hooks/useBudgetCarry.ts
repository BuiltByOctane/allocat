import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDB, type SyncMetaEntry } from "@/lib/db";
import { useEnqueue } from "@/lib/hooks/useSync";
import { reapplyRulesToPending } from "@/lib/sms/ingestClient";
import { pushSmsMirrorToNative } from "@/lib/sms/nativeMirror";
import {
  buildCarryPayload,
  carryMarkerKey,
  findCarrySource,
  isEmptyBudget,
  type CarryPayload,
} from "@/lib/budget/carry";
import { budgetKey } from "./useBudget";
import { DASHBOARD_KEY } from "./useDashboard";

export type CarryMarker = NonNullable<SyncMetaEntry["carry"]>;

export function carryMarkerQueryKey(month: number, year: number) {
  return ["carryMarker", month, year] as const;
}

export async function getCarryMarker(
  month: number,
  year: number
): Promise<CarryMarker | null> {
  const db = getDB();
  const entry = await db.sync_meta.get(carryMarkerKey(month, year));
  return entry?.carry ?? null;
}

/** Reactive read of the carry marker for a period (drives the banner). */
export function useCarryMarker(month: number, year: number) {
  return useQuery({
    queryKey: carryMarkerQueryKey(month, year),
    queryFn: () => getCarryMarker(month, year),
  });
}

/**
 * Whether an eligible carry source exists for a period (drives the "Copy from
 * June" CTA in the budget empty state). Reads IDB only.
 */
export function useCarrySource(month: number, year: number) {
  return useQuery({
    queryKey: ["carrySource", month, year] as const,
    queryFn: async (): Promise<{ id: string; label: string } | null> => {
      const db = getDB();
      const budgets = await db.budgets.toArray();
      const counts = new Map<string, number>();
      for (const b of budgets) {
        counts.set(
          b.id,
          await db.categories.where("budget_id").equals(b.id).count()
        );
      }
      const source = findCarrySource(budgets, counts, { month, year });
      return source ? { id: source.id, label: monthLabel(source.month) } : null;
    },
  });
}

function monthLabel(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString(undefined, {
    month: "long",
  });
}

// Same-tab double-fire guard (cross-tab is handled by the Dexie rw transaction).
let inFlight: Promise<CarryResult> | null = null;

export interface CarryResult {
  carried: boolean;
  sourceLabel: string | null;
  budgetId: string | null;
}

/**
 * Copy the most recent prior budget into an empty target month: optimistic IDB
 * rows + one CARRY_SETUP enqueue. Everything is decided inside a single Dexie
 * rw transaction — IndexedDB serializes those across tabs, so two tabs (or a
 * hydration race) can't both carry the same month. Idempotent per period via
 * the sync_meta marker; returns `carried: false` when there's nothing to do.
 */
export function useCarryBudget() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      month,
      year,
    }: {
      month: number;
      year: number;
      /** True when fired by the CarryController (shows the undo banner). */
      auto: boolean;
    }): Promise<CarryResult> => {
      if (inFlight) return inFlight;
      inFlight = (async () => {
        const db = getDB();
        const markerKey = carryMarkerKey(month, year);

        const outcome = await db.transaction(
          "rw",
          [db.budgets, db.categories, db.budget_items, db.sync_meta],
          async (): Promise<{ payload: CarryPayload; label: string } | null> => {
            // Re-check inside the transaction — another tab may have carried,
            // set up, or dismissed while we were queued behind its lock.
            if (await db.sync_meta.get(markerKey)) return null;

            const target = await db.budgets
              .where("[month+year]")
              .equals([month, year])
              .first();
            if (target) {
              const targetCats = await db.categories
                .where("budget_id")
                .equals(target.id)
                .toArray();
              if (
                !isEmptyBudget({
                  totalBudget: Number(target.total_budget),
                  categories: targetCats,
                })
              )
                return null;
            }

            const allBudgets = await db.budgets.toArray();
            const counts = new Map<string, number>();
            for (const b of allBudgets) {
              counts.set(
                b.id,
                await db.categories.where("budget_id").equals(b.id).count()
              );
            }
            const source = findCarrySource(allBudgets, counts, { month, year });
            if (!source) return null;

            const sourceCats = await db.categories
              .where("budget_id")
              .equals(source.id)
              .toArray();
            const itemsByCategoryId = new Map(
              await Promise.all(
                sourceCats.map(
                  async (c) =>
                    [
                      c.id,
                      await db.budget_items
                        .where("category_id")
                        .equals(c.id)
                        .toArray(),
                    ] as const
                )
              )
            );

            const payload = buildCarryPayload(
              {
                budget: source,
                categories: sourceCats,
                itemsByCategoryId,
              },
              { month, year, existingBudgetId: target?.id ?? null },
              () => crypto.randomUUID()
            );

            const now = new Date().toISOString();
            const budgetId = payload.budgetId ?? payload.budgetTempId!;
            if (payload.budgetTempId) {
              await db.budgets.add({
                id: payload.budgetTempId,
                user_id: "__pending__",
                month,
                year,
                total_budget: payload.totalBudget,
                is_locked: false,
                template_id: payload.templateId,
                created_at: now,
                updated_at: now,
              });
            } else {
              await db.budgets.update(budgetId, {
                total_budget: payload.totalBudget,
                template_id: payload.templateId,
                updated_at: now,
              });
            }

            for (const cat of payload.categories) {
              await db.categories.add({
                id: cat.tempId,
                budget_id: budgetId,
                user_id: "__pending__",
                name: cat.name,
                icon: cat.icon,
                color: cat.color,
                type: cat.type,
                allocated_amount: cat.allocated_amount,
                created_at: now,
                updated_at: now,
              });
              for (const item of cat.items) {
                await db.budget_items.add({
                  id: item.tempId,
                  category_id: cat.tempId,
                  user_id: "__pending__",
                  name: item.name,
                  emoji: item.emoji,
                  planned_amount: item.planned,
                  actual_amount: 0,
                  is_completed: false,
                  notes: null,
                  link_type: item.linkType,
                  link_id: item.linkId,
                  template_id: item.templateItemId ? payload.templateId : null,
                  template_item_id: item.templateItemId,
                  overspend_count: 0,
                  created_at: now,
                  updated_at: now,
                });
              }
            }
            // NOTE: source items with minted identity are NOT stamped locally —
            // the server owns that write; the next hydrate/forced refresh
            // converges. Keeps undo trivially local.

            const label = monthLabel(source.month);
            await db.sync_meta.put({
              table: markerKey,
              lastSynced: Date.now(),
              carry: { state: "carried", sourceLabel: label, budgetId },
            });
            return { payload, label };
          }
        );

        if (!outcome) return { carried: false, sourceLabel: null, budgetId: null };

        const { payload, label } = outcome;
        await enqueue({
          table: "budgets",
          operation: "CARRY_SETUP",
          recordId: payload.budgetId ?? payload.budgetTempId!,
          payload: payload as unknown as Record<string, unknown>,
        });

        // Carried items have durable identity — SMS that landed pending while
        // the month had no budget can auto-allocate right away. Best-effort.
        try {
          await reapplyRulesToPending({ enqueue });
        } catch {
          /* best-effort */
        }
        try {
          await pushSmsMirrorToNative();
        } catch {
          /* best-effort */
        }

        return {
          carried: true,
          sourceLabel: label,
          budgetId: payload.budgetId ?? payload.budgetTempId!,
        };
      })();
      try {
        return await inFlight;
      } finally {
        inFlight = null;
      }
    },
    onSuccess: (result, { month, year }) => {
      if (!result.carried) return;
      qc.invalidateQueries({ queryKey: budgetKey(month, year) });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
      qc.invalidateQueries({ queryKey: carryMarkerQueryKey(month, year) });
    },
  });
}

/**
 * Undo a carried month. Local-only when the CARRY_SETUP is still queued
 * (delete the queue item + optimistic rows — zero server traffic); otherwise
 * the same local cleanup plus an UNDO_CARRY enqueue. Blocked when spend has
 * already been logged against a carried item (SMS auto-allocation) — undoing
 * then would destroy history.
 */
export function useUndoCarry() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      month,
      year,
    }: {
      month: number;
      year: number;
    }): Promise<{ blocked: boolean }> => {
      const db = getDB();
      const markerKey = carryMarkerKey(month, year);
      const marker = (await db.sync_meta.get(markerKey))?.carry;
      if (!marker || marker.state !== "carried") return { blocked: false };

      const budget = await db.budgets
        .where("[month+year]")
        .equals([month, year])
        .first();
      if (!budget) return { blocked: false };

      const cats = await db.categories
        .where("budget_id")
        .equals(budget.id)
        .toArray();
      for (const c of cats) {
        const items = await db.budget_items
          .where("category_id")
          .equals(c.id)
          .toArray();
        if (items.some((i) => Number(i.actual_amount) > 0)) {
          return { blocked: true };
        }
      }

      // Still queued → cancel locally before the engine picks it up.
      const pendingCarry = await db.sync_queue
        .filter(
          (q) =>
            q.table === "budgets" &&
            q.operation === "CARRY_SETUP" &&
            q.recordId === budget.id &&
            q.status === "pending"
        )
        .first();

      for (const c of cats) {
        const items = await db.budget_items
          .where("category_id")
          .equals(c.id)
          .toArray();
        for (const i of items) await db.budget_items.delete(i.id);
        await db.categories.delete(c.id);
      }

      const isTempBudget = budget.id.startsWith("temp_");
      if (isTempBudget) {
        await db.budgets.delete(budget.id);
      } else {
        await db.budgets.update(budget.id, {
          total_budget: 0,
          template_id: null,
          updated_at: new Date().toISOString(),
        });
      }

      if (pendingCarry?.id !== undefined) {
        await db.sync_queue.delete(pendingCarry.id);
      } else {
        await enqueue({
          table: "budgets",
          operation: "UNDO_CARRY",
          recordId: budget.id,
          payload: { budgetId: budget.id },
        });
      }

      await db.sync_meta.put({
        table: markerKey,
        lastSynced: Date.now(),
        carry: { ...marker, state: "undone" },
      });

      try {
        await pushSmsMirrorToNative();
      } catch {
        /* best-effort */
      }

      return { blocked: false };
    },
    onSuccess: (_res, { month, year }) => {
      qc.invalidateQueries({ queryKey: budgetKey(month, year) });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
      qc.invalidateQueries({ queryKey: carryMarkerQueryKey(month, year) });
    },
  });
}

/** Mark the banner handled for a period without touching the budget. */
export function useDismissCarryBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ month, year }: { month: number; year: number }) => {
      const db = getDB();
      const markerKey = carryMarkerKey(month, year);
      const entry = await db.sync_meta.get(markerKey);
      if (entry?.carry) {
        await db.sync_meta.put({
          ...entry,
          carry: { ...entry.carry, state: "dismissed" },
        });
      }
    },
    onSuccess: (_res, { month, year }) => {
      qc.invalidateQueries({ queryKey: carryMarkerQueryKey(month, year) });
    },
  });
}
