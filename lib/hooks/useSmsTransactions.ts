import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDB } from "@/lib/db";
import type { SmsTransactionRow } from "@/lib/db";
import { useEnqueue } from "@/lib/hooks/useSync";
import { ingestSmsClient } from "@/lib/sms/ingestClient";
import { nearLimitFromIDB } from "@/lib/sms/nearLimit";
import { randomUUID } from "@/lib/utils/uuid";
import { notifyLocal } from "@/lib/native/notify";
import { formatCurrency } from "@/lib/number-format";
import { DASHBOARD_KEY } from "./useDashboard";

export const SMS_TX_KEY = ["sms-transactions"] as const;

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

// ─── Query ────────────────────────────────────────────────────────────────────

export function usePendingSms() {
  return useQuery({
    queryKey: SMS_TX_KEY,
    queryFn: () => getPendingSmsFromIDB(),
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
    }) => {
      const db = getDB();
      const txn = await db.sms_transactions.get(input.txnId);
      if (!txn) throw new Error("Transaction not found");

      // Optimistic: mark categorized + reflect the spend on the budget item.
      await db.sms_transactions.update(input.txnId, {
        status: "categorized",
        budget_item_id: input.budgetItemId,
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
        recordId: input.txnId,
        payload: {
          txnId: input.txnId,
          budgetItemId: input.budgetItemId,
          rememberRule: input.rememberRule ?? false,
          matchType: input.matchType ?? "contains",
        },
      });
      return { ok: true };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SMS_TX_KEY });
      qc.invalidateQueries({ queryKey: ["budget"] });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
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
