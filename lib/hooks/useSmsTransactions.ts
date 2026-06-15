import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { getDB } from "@/lib/db";
import type { SmsTransactionRow } from "@/lib/db";
import { useEnqueue } from "@/lib/hooks/useSync";
import { ingestSmsClient } from "@/lib/sms/ingestClient";
import { nearLimitFromIDB } from "@/lib/sms/nearLimit";
import { randomUUID } from "@/lib/utils/uuid";
import { notifyLocal } from "@/lib/native/notify";
import { SmsReader } from "@/lib/native/SmsReader";
import { formatCurrency } from "@/lib/number-format";
import { DASHBOARD_KEY } from "./useDashboard";
import { NET_WORTH_KEY } from "./useNetWorth";

export const SMS_TX_KEY = ["sms-transactions"] as const;
export const SMS_CATEGORIZED_KEY = ["sms-transactions", "categorized"] as const;

/** Invalidate every query that an allocate/reverse touches. */
function invalidateSmsCaches(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: SMS_TX_KEY });
  qc.invalidateQueries({ queryKey: SMS_CATEGORIZED_KEY });
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
    const [rules, cats, items] = await Promise.all([
      db.merchant_rules.toArray(),
      db.categories.toArray(),
      db.budget_items.toArray(),
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
    const payload = rules.map((r) => {
      const it = itemsById.get(r.budget_item_id);
      return {
        match_type: r.match_type,
        pattern: r.pattern,
        category: name.get(r.category_id) ?? "",
        allocated: alloc.get(r.category_id) ?? 0,
        spent: spent.get(r.category_id) ?? 0,
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
    }) => {
      const db = getDB();

      const { txnId, txn } = await resolveTxn(db, input.txnId);
      if (!txn) throw new Error("Transaction not found");

      // Optimistic: mark categorized + reflect the spend on the budget item.
      await db.sms_transactions.update(txnId, {
        status: "categorized",
        budget_item_id: input.budgetItemId,
        ...(input.label !== undefined ? { label: input.label } : {}),
      });
      const item = await db.budget_items.get(input.budgetItemId);
      if (item && typeof txn.amount === "number") {
        await db.budget_items.update(input.budgetItemId, {
          actual_amount: Number(item.actual_amount) + txn.amount,
        });
      }

      // Optimistically persist the learned rule to IDB so the *next* SMS from
      // this merchant auto-applies immediately (server also creates the canonical
      // row; next hydrate reconciles).
      let ruleLearned = false;
      if (input.rememberRule && txn.merchant_normalized && item) {
        const now = new Date().toISOString();
        await db.merchant_rules.add({
          id: `temp_${randomUUID()}`,
          user_id: "__pending__",
          match_type: input.matchType ?? "contains",
          pattern: txn.merchant_normalized,
          merchant_normalized: txn.merchant_normalized,
          budget_item_id: input.budgetItemId,
          category_id: item.category_id,
          auto_apply: true,
          times_applied: 0,
          created_at: now,
          updated_at: now,
        });
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
    }) => {
      const db = getDB();
      const { txnId, txn } = await resolveTxn(db, input.txnId);
      if (!txn) throw new Error("Transaction not found");

      const oldItemId = txn.budget_item_id;
      const moving = oldItemId !== input.newBudgetItemId;

      if (moving && typeof txn.amount === "number") {
        if (oldItemId) {
          const oldItem = await db.budget_items.get(oldItemId);
          if (oldItem) {
            await db.budget_items.update(oldItemId, {
              actual_amount: Math.max(0, Number(oldItem.actual_amount) - txn.amount),
            });
          }
        }
        const newItem = await db.budget_items.get(input.newBudgetItemId);
        if (newItem) {
          await db.budget_items.update(input.newBudgetItemId, {
            actual_amount: Number(newItem.actual_amount) + txn.amount,
          });
        }
      }

      await db.sms_transactions.update(txnId, {
        budget_item_id: input.newBudgetItemId,
        ...(input.label !== undefined ? { label: input.label } : {}),
      });
      await enqueue({
        table: "sms_transactions",
        operation: "RECATEGORIZE",
        recordId: txnId,
        payload: {
          txnId,
          newBudgetItemId: input.newBudgetItemId,
          ...(input.label !== undefined ? { label: input.label } : {}),
        },
      });
      return { ok: true };
    },
    onSuccess: () => invalidateSmsCaches(qc),
  });
}
