import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { getDB } from "@/lib/db";
import type { SmsTransactionRow } from "@/lib/db";
import { useEnqueue } from "@/lib/hooks/useSync";
import { ingestSmsClient } from "@/lib/sms/ingestClient";
import { smsTemplateKey } from "@/lib/sms/match";
import { nearLimitFromIDB } from "@/lib/sms/nearLimit";
import { randomUUID } from "@/lib/utils/uuid";
import { notifyLocal } from "@/lib/native/notify";
import { SmsReader } from "@/lib/native/SmsReader";
import { formatCurrency } from "@/lib/number-format";
import { DASHBOARD_KEY } from "./useDashboard";
import { NET_WORTH_KEY } from "./useNetWorth";

export const SMS_TX_KEY = ["sms-transactions"] as const;
export const SMS_CATEGORIZED_KEY = ["sms-transactions", "categorized"] as const;
export const ALL_TX_KEY = ["transactions", "all"] as const;
export const ITEM_TX_KEY = ["item-transactions"] as const;
export function itemTxKey(itemId: string) {
  return ["item-transactions", itemId] as const;
}

/** Invalidate every query that an allocate/reverse touches. */
function invalidateSmsCaches(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: SMS_TX_KEY });
  qc.invalidateQueries({ queryKey: SMS_CATEGORIZED_KEY });
  qc.invalidateQueries({ queryKey: ALL_TX_KEY });
  qc.invalidateQueries({ queryKey: ITEM_TX_KEY });
  qc.invalidateQueries({ queryKey: ["budget"] });
  qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
  qc.invalidateQueries({ queryKey: ["sms-picker"] });
  qc.invalidateQueries({ queryKey: ["categoryData"] });
  // Asset/debt cascade reversal moves net worth.
  qc.invalidateQueries({ queryKey: NET_WORTH_KEY });
}

/**
 * Resolve a possibly-stale txn id. SyncEngine rewrites a row's id temp_ → real
 * once its INSERT syncs, so a captured id can miss even though the row exists
 * under its real id. Follow id_map before giving up. Returns the resolved id +
 * row (or null row if truly absent).
 */
async function resolveTxn(
  db: ReturnType<typeof getDB>,
  rawId: string,
): Promise<{ txnId: string; txn: SmsTransactionRow | undefined }> {
  let txnId = rawId;
  let txn = await db.sms_transactions.get(txnId);
  if (!txn && txnId.startsWith("temp_")) {
    const mapped = await db.id_map.get(txnId);
    if (mapped?.realId) {
      const real = await db.sms_transactions.get(mapped.realId);
      if (real) {
        txnId = mapped.realId;
        txn = real;
      }
    }
  }
  return { txnId, txn };
}

/**
 * Mirror current merchant rules into the native receiver so a *closed-app*
 * notification can auto-sort a known merchant the instant a rule is LEARNED —
 * not only on the next app open. Mirrors the `setRules` payload shape built in
 * components/pwa/SmsBridge.tsx (pushRules). No-op on web (SmsReader is native).
 */
async function pushRulesToNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const db = getDB();
    const [rules, cats, items, budgets] = await Promise.all([
      db.merchant_rules.toArray(),
      db.categories.toArray(),
      db.budget_items.toArray(),
      db.budgets.toArray(),
    ]);
    const name = new Map(cats.map((c) => [c.id, c.name]));
    const alloc = new Map(cats.map((c) => [c.id, Number(c.allocated_amount)]));
    const spent = new Map<string, number>();
    const itemsById = new Map(items.map((it) => [it.id, it]));
    for (const it of items) {
      spent.set(
        it.category_id,
        (spent.get(it.category_id) ?? 0) + Number(it.actual_amount),
      );
    }

    // Display should name THIS month's item, not the stale cache: durable rules
    // now resolve cross-month. Build a (template_id, template_item_id) → item map
    // scoped to the current month's budget, preferring it over r.budget_item_id.
    const now = new Date();
    const curBudget = budgets.find(
      (b) => b.month === now.getMonth() + 1 && b.year === now.getFullYear(),
    );
    const curCatIds = new Set(
      cats.filter((c) => c.budget_id === curBudget?.id).map((c) => c.id),
    );
    const durableMap = new Map<string, (typeof items)[number]>();
    for (const it of items) {
      if (it.template_id && it.template_item_id && curCatIds.has(it.category_id)) {
        durableMap.set(`${it.template_id}::${it.template_item_id}`, it);
      }
    }

    const payload = rules.map((r) => {
      const it =
        (r.template_id && r.template_item_id
          ? durableMap.get(`${r.template_id}::${r.template_item_id}`)
          : undefined) ??
        (r.budget_item_id ? itemsById.get(r.budget_item_id) : undefined);
      const catId = it?.category_id ?? r.category_id ?? "";
      return {
        match_type: r.match_type,
        pattern: r.pattern,
        category: name.get(catId) ?? "",
        allocated: alloc.get(catId) ?? 0,
        spent: spent.get(catId) ?? 0,
        itemName: it?.name ?? "",
        itemPlanned: it ? Number(it.planned_amount) : 0,
        itemActual: it ? Number(it.actual_amount) : 0,
      };
    });
    await SmsReader.setRules({ rules: JSON.stringify(payload) });
  } catch {
    /* native unavailable — ignore */
  }
}

// ─── IDB read helper ──────────────────────────────────────────────────────────

/** Pending (unallocated) SMS transactions, newest first. */
export async function getPendingSmsFromIDB(): Promise<SmsTransactionRow[]> {
  const db = getDB();
  const rows = await db.sms_transactions
    .where("status")
    .equals("pending")
    .toArray();
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Categorized (allocated) SMS transactions, newest first. */
export async function getCategorizedSmsFromIDB(): Promise<SmsTransactionRow[]> {
  const db = getDB();
  const rows = await db.sms_transactions
    .where("status")
    .equals("categorized")
    .toArray();
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Sort key for the history: the spend time, falling back to capture time. */
function txnSortTime(row: SmsTransactionRow): string {
  return row.occurred_at ?? row.created_at;
}

/**
 * Every categorized transaction (both SMS + manual sources), newest first.
 * Backs the /transactions history. Sorts by occurred_at (the spend's own time)
 * with created_at as a fallback so manual rows without occurred_at still slot in.
 */
export async function getAllTransactionsFromIDB(): Promise<SmsTransactionRow[]> {
  const db = getDB();
  const rows = await db.sms_transactions
    .where("status")
    .equals("categorized")
    .toArray();
  return rows.sort((a, b) => txnSortTime(b).localeCompare(txnSortTime(a)));
}

/** Categorized transactions for a single budget item, newest first. */
export async function getItemTransactionsFromIDB(
  itemId: string,
): Promise<SmsTransactionRow[]> {
  const db = getDB();
  const rows = await db.sms_transactions
    .where("budget_item_id")
    .equals(itemId)
    .toArray();
  return rows
    .filter((r) => r.status === "categorized")
    .sort((a, b) => txnSortTime(b).localeCompare(txnSortTime(a)));
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function usePendingSms() {
  return useQuery({
    queryKey: SMS_TX_KEY,
    queryFn: () => getPendingSmsFromIDB(),
  });
}

export function useCategorizedSms() {
  return useQuery({
    queryKey: SMS_CATEGORIZED_KEY,
    queryFn: () => getCategorizedSmsFromIDB(),
  });
}

/** All categorized transactions (SMS + manual) for the /transactions history. */
export function useAllTransactions() {
  return useQuery({
    queryKey: ALL_TX_KEY,
    queryFn: () => getAllTransactionsFromIDB(),
  });
}

/** Categorized transactions allocated to a single budget item. */
export function useItemTransactions(itemId: string) {
  return useQuery({
    queryKey: itemTxKey(itemId),
    queryFn: () => getItemTransactionsFromIDB(itemId),
    enabled: !!itemId,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Feed a raw SMS through the ingest pipeline (used by dev harness + native bridge). */
export function useIngestSms() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();
  return useMutation({
    mutationFn: (input: { raw: string; sender?: string | null }) =>
      ingestSmsClient(input, { enqueue }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SMS_TX_KEY });
      qc.invalidateQueries({ queryKey: ["budget"] });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
      // An auto-applied ingest bumps a budget item's actual_amount, which the
      // /sms allocate picker and the category detail screen also read.
      qc.invalidateQueries({ queryKey: ["sms-picker"] });
      qc.invalidateQueries({ queryKey: ["categoryData"] });
    },
  });
}

export function useCategorizeSms() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();
  return useMutation({
    mutationFn: async (input: {
      txnId: string;
      budgetItemId: string;
      rememberRule?: boolean;
      matchType?: "exact" | "contains" | "regex";
      label?: string | null;
      /** Edited spend amount (defaults to the parsed amount). */
      amount?: number;
    }) => {
      const db = getDB();

      const { txnId, txn } = await resolveTxn(db, input.txnId);
      if (!txn) throw new Error("Transaction not found");

      // An edited amount logs the EDITED value (not the parsed one) and stashes
      // the original parsed amount the first time it changes.
      const edited =
        typeof input.amount === "number" &&
        input.amount > 0 &&
        input.amount !== txn.amount;
      const spendAmount =
        edited && typeof input.amount === "number"
          ? input.amount
          : typeof txn.amount === "number"
            ? txn.amount
            : null;

      // Optimistic: mark categorized + reflect the spend on the budget item.
      await db.sms_transactions.update(txnId, {
        status: "categorized",
        budget_item_id: input.budgetItemId,
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(edited
          ? {
              amount: spendAmount,
              original_amount: txn.original_amount ?? txn.amount,
            }
          : {}),
      });
      const item = await db.budget_items.get(input.budgetItemId);
      if (item && typeof spendAmount === "number") {
        await db.budget_items.update(input.budgetItemId, {
          actual_amount: Number(item.actual_amount) + spendAmount,
        });
      }

      // Optimistically persist the learned rule to IDB so the *next* SMS from
      // this merchant auto-applies immediately (server also creates the canonical
      // row; next hydrate reconciles).
      let ruleLearned = false;
      if (input.rememberRule && txn.merchant_normalized && item) {
        const now = new Date().toISOString();
        const matchType = input.matchType ?? "contains";
        const durable = {
          merchant_normalized: txn.merchant_normalized,
          // Durable cross-month key; budget_item_id/category_id are caches.
          template_id: item.template_id ?? null,
          template_item_id: item.template_item_id ?? null,
          budget_item_id: input.budgetItemId,
          category_id: item.category_id,
          auto_apply: true,
          updated_at: now,
        };
        // Re-point an existing rule for this merchant instead of stacking a
        // duplicate (mirrors the server upsert) — keeps matching unambiguous.
        const existing = (await db.merchant_rules.toArray()).find(
          (r) =>
            r.match_type === matchType && r.pattern === txn.merchant_normalized,
        );
        if (existing) {
          await db.merchant_rules.update(existing.id, durable);
        } else {
          await db.merchant_rules.add({
            id: `temp_${randomUUID()}`,
            user_id: "__pending__",
            match_type: matchType,
            pattern: txn.merchant_normalized,
            times_applied: 0,
            created_at: now,
            ...durable,
          });
        }
        ruleLearned = true;
      }

      // Device-visible near-limit alert (native; no-op on web).
      const nl = await nearLimitFromIDB(input.budgetItemId);
      if (nl) {
        const left = formatCurrency(nl.remaining, {
          code: txn.currency ?? "INR",
          maximumFractionDigits: 0,
        });
        await notifyLocal({
          title: nl.over ? "🙀 Budget blown!" : "😼 Budget's getting thin",
          body: nl.over
            ? `${nl.name} is over budget. The cat's out of the bag.`
            : `${nl.name} at ${Math.round(nl.ratio * 100)}% — only ${left} left. Tread softly.`,
          url: "/budget",
        });
      }

      await enqueue({
        table: "sms_transactions",
        operation: "CATEGORIZE",
        recordId: txnId,
        payload: {
          txnId,
          budgetItemId: input.budgetItemId,
          rememberRule: input.rememberRule ?? false,
          matchType: input.matchType ?? "contains",
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(edited ? { amount: spendAmount } : {}),
        },
      });

      // A rule was just learned → refresh the native receiver's rule set now so
      // a closed-app notification auto-sorts this merchant (instead of "A wild
      // spend appeared!") without waiting for the next app open. No-op on web.
      if (ruleLearned) await pushRulesToNative();

      return { ok: true };
    },
    onSuccess: () => invalidateSmsCaches(qc),
  });
}

export function useIgnoreSms() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();
  return useMutation({
    mutationFn: async (txnId: string) => {
      const db = getDB();
      await db.sms_transactions.update(txnId, { status: "ignored" });
      await enqueue({
        table: "sms_transactions",
        operation: "IGNORE",
        recordId: txnId,
        payload: { txnId },
      });
      return { ok: true };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SMS_TX_KEY }),
  });
}

/** Delete an SMS txn. If categorized, refund the amount to its budget item. */
export function useDeleteSms() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();
  return useMutation({
    mutationFn: async (rawId: string) => {
      const db = getDB();
      const { txnId, txn } = await resolveTxn(db, rawId);
      if (!txn) return { ok: true };

      // Refund the spend optimistically (categorized only).
      if (txn.status === "categorized" && txn.budget_item_id && typeof txn.amount === "number") {
        const item = await db.budget_items.get(txn.budget_item_id);
        if (item) {
          await db.budget_items.update(txn.budget_item_id, {
            actual_amount: Math.max(0, Number(item.actual_amount) - txn.amount),
          });
        }
      }

      await db.sms_transactions.delete(txnId);
      await enqueue({
        table: "sms_transactions",
        operation: "DELETE",
        recordId: txnId,
        payload: { txnId },
      });
      return { ok: true };
    },
    onSuccess: () => invalidateSmsCaches(qc),
  });
}

/**
 * "Report wrong SMS": blocklist the SMS *template* (so future SMS of the same
 * kind are skipped at ingest), then refund + delete the wrongly-captured txn.
 * mutate takes a single txnId. The raw SMS body stays on-device — only the
 * one-way template hash is synced.
 */
export function useReportSmsMistake() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();
  return useMutation({
    mutationFn: async (txnId: string) => {
      const db = getDB();
      const { txnId: resolvedId, txn } = await resolveTxn(db, txnId);
      if (!txn) return { ok: true };

      const templateKey = smsTemplateKey({
        sender: txn.sender,
        raw: txn.raw_text ?? "",
      });
      const sampleLabel = txn.merchant_raw ?? null;
      const now = new Date().toISOString();
      const blocklistTempId = `temp_${randomUUID()}`;

      // Optimistic: record the blocklist row so the next matching SMS is skipped
      // locally before the server confirms.
      await db.sms_blocklist.add({
        id: blocklistTempId,
        user_id: "__pending__",
        template_key: templateKey,
        sample_label: sampleLabel,
        created_at: now,
      });

      // Refund the spend optimistically (categorized only), then drop the txn.
      if (
        txn.status === "categorized" &&
        txn.budget_item_id &&
        typeof txn.amount === "number"
      ) {
        const item = await db.budget_items.get(txn.budget_item_id);
        if (item) {
          await db.budget_items.update(txn.budget_item_id, {
            actual_amount: Math.max(0, Number(item.actual_amount) - txn.amount),
          });
        }
      }
      await db.sms_transactions.delete(resolvedId);

      await enqueue({
        table: "sms_blocklist",
        operation: "INSERT",
        recordId: blocklistTempId,
        tempId: blocklistTempId,
        payload: { txnId: resolvedId, templateKey, sampleLabel },
      });

      return { ok: true };
    },
    onSuccess: () => invalidateSmsCaches(qc),
  });
}

/** Reverse a categorized txn's spend and move it back to pending. */
export function useUnallocateSms() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();
  return useMutation({
    mutationFn: async (rawId: string) => {
      const db = getDB();
      const { txnId, txn } = await resolveTxn(db, rawId);
      if (!txn) throw new Error("Transaction not found");

      if (txn.budget_item_id && typeof txn.amount === "number") {
        const item = await db.budget_items.get(txn.budget_item_id);
        if (item) {
          await db.budget_items.update(txn.budget_item_id, {
            actual_amount: Math.max(0, Number(item.actual_amount) - txn.amount),
          });
        }
      }

      await db.sms_transactions.update(txnId, {
        status: "pending",
        budget_item_id: null,
        matched_rule_id: null,
      });
      await enqueue({
        table: "sms_transactions",
        operation: "UNALLOCATE",
        recordId: txnId,
        payload: { txnId },
      });
      return { ok: true };
    },
    onSuccess: () => invalidateSmsCaches(qc),
  });
}

/** Move a categorized txn to a different budget item and/or rename it. */
export function useRecategorizeSms() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();
  return useMutation({
    mutationFn: async (input: {
      txnId: string;
      newBudgetItemId: string;
      label?: string | null;
      /** Edited spend amount (defaults to the current amount). */
      amount?: number;
    }) => {
      const db = getDB();
      const { txnId, txn } = await resolveTxn(db, input.txnId);
      if (!txn) throw new Error("Transaction not found");

      const oldItemId = txn.budget_item_id;
      const moving = oldItemId !== input.newBudgetItemId;
      const oldAmount = typeof txn.amount === "number" ? txn.amount : 0;
      const edited =
        typeof input.amount === "number" &&
        input.amount > 0 &&
        input.amount !== oldAmount;
      const newAmount = edited ? (input.amount as number) : oldAmount;

      if (moving && oldAmount > 0) {
        // Moving: reverse the OLD amount off the old item, apply the (possibly
        // edited) NEW amount to the new item.
        if (oldItemId) {
          const oldItem = await db.budget_items.get(oldItemId);
          if (oldItem) {
            await db.budget_items.update(oldItemId, {
              actual_amount: Math.max(0, Number(oldItem.actual_amount) - oldAmount),
            });
          }
        }
        const newItem = await db.budget_items.get(input.newBudgetItemId);
        if (newItem && newAmount > 0) {
          await db.budget_items.update(input.newBudgetItemId, {
            actual_amount: Number(newItem.actual_amount) + newAmount,
          });
        }
      } else if (!moving && edited && oldItemId) {
        // Same item, amount changed: apply only the delta (new - old).
        const item = await db.budget_items.get(oldItemId);
        if (item) {
          await db.budget_items.update(oldItemId, {
            actual_amount: Math.max(0, Number(item.actual_amount) + (newAmount - oldAmount)),
          });
        }
      }

      await db.sms_transactions.update(txnId, {
        budget_item_id: input.newBudgetItemId,
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(edited
          ? { amount: newAmount, original_amount: txn.original_amount ?? oldAmount }
          : {}),
      });
      await enqueue({
        table: "sms_transactions",
        operation: "RECATEGORIZE",
        recordId: txnId,
        payload: {
          txnId,
          newBudgetItemId: input.newBudgetItemId,
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(edited ? { amount: newAmount } : {}),
        },
      });
      return { ok: true };
    },
    onSuccess: () => invalidateSmsCaches(qc),
  });
}

// ─── Manual spend → ledger row ────────────────────────────────────────────────

type EnqueueFn = (
  item: Omit<
    import("@/lib/db").SyncQueueItem,
    "id" | "retries" | "status" | "createdAt"
  >,
) => Promise<void>;

/**
 * Record a manual budget spend as a real transaction so it shows up in the
 * /transactions history and the per-item list. This is a LEDGER record only —
 * the caller (e.g. useQuickLogSpend) already bumped the budget item's
 * actual_amount, so the server insert deliberately does NOT re-apply the spend.
 *
 * Writes an optimistic already-categorized sms_transactions row and enqueues an
 * INSERT (source "manual"); the server's ingestSmsTransaction inserts the
 * canonical row without touching actual_amount.
 */
export async function writeManualTransaction(
  input: {
    budgetItemId: string;
    amount: number;
    currency?: string | null;
    label?: string | null;
  },
  deps: { enqueue: EnqueueFn },
): Promise<{ txnId: string }> {
  const db = getDB();
  const tempId = `temp_${randomUUID()}`;
  const now = new Date().toISOString();
  const dedupeKey = `manual_${randomUUID()}`;

  await db.sms_transactions.add({
    id: tempId,
    user_id: "__pending__",
    raw_text: null,
    sender: null,
    amount: input.amount,
    currency: input.currency ?? "INR",
    merchant_raw: null,
    merchant_normalized: null,
    direction: "debit",
    occurred_at: now,
    dedupe_key: dedupeKey,
    status: "categorized",
    matched_rule_id: null,
    budget_item_id: input.budgetItemId,
    label: input.label ?? null,
    source: "manual",
    original_amount: null,
    created_at: now,
  });

  await deps.enqueue({
    table: "sms_transactions",
    operation: "INSERT",
    recordId: tempId,
    tempId,
    payload: {
      amount: input.amount,
      currency: input.currency ?? "INR",
      direction: "debit",
      occurredAt: now,
      dedupeKey,
      source: "manual",
      status: "categorized",
      budgetItemId: input.budgetItemId,
      label: input.label ?? null,
    },
  });

  return { txnId: tempId };
}
