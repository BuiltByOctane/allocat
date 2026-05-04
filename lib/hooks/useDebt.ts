import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDebtData, getDebtPaymentTrend } from "@/lib/actions/debt";
import { getDB } from "@/lib/db";
import { useEnqueue } from "@/lib/hooks/useSync";
import { DASHBOARD_KEY } from "./useDashboard";
import { NET_WORTH_KEY } from "./useNetWorth";
import { calcTotalRepayable } from "@/lib/utils/debt-calc";

export const DEBT_KEY = ["debt"] as const;
export const DEBT_TREND_KEY = ["debt-trend"] as const;

// ─── IDB read helper ──────────────────────────────────────────────────────────

export async function getDebtFromIDB() {
  const db = getDB();
  const debts = await db.debts.orderBy("created_at").toArray();
  if (debts.length === 0) return null;

  return debts.map((d) => ({
    id: d.id,
    name: d.name,
    icon: d.icon,
    type: d.type,
    principal: Number(d.principal),
    interestRate: Number(d.interest_rate),
    monthlyMin: Number(d.monthly_minimum),
    totalPaid: Number(d.total_paid),
    expectedPayoffDate: d.expected_payoff_date,
    isClosed: d.is_closed,
    interestType: (d.interest_type ?? "flat") as "flat" | "diminishing",
    loanTenureMonths: d.loan_tenure_months ?? null,
    totalRepayable: Number(d.total_repayable ?? d.principal),
  }));
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useDebtData() {
  return useQuery({
    queryKey: DEBT_KEY,
    queryFn: async () => {
      const local = await getDebtFromIDB();
      if (local) return local;
      return getDebtData();
    },
  });
}

export function useDebtPaymentTrend() {
  return useQuery({
    queryKey: DEBT_TREND_KEY,
    queryFn: () => getDebtPaymentTrend(),
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useAddDebt() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      name,
      type,
      principal,
      interestRate,
      monthlyMin,
      expectedPayoffDate,
      interestType = "flat",
      loanTenureMonths = null,
    }: {
      name: string;
      type: "internal" | "external" | "lent";
      principal: number;
      interestRate: number;
      monthlyMin: number;
      expectedPayoffDate?: string | null;
      interestType?: "flat" | "diminishing";
      loanTenureMonths?: number | null;
    }) => {
      const db = getDB();
      const tempId = `temp_${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const totalRepayable = calcTotalRepayable(principal, interestRate, loanTenureMonths, interestType);

      await db.debts.add({
        id: tempId,
        user_id: "__pending__",
        name,
        icon: null,
        type,
        principal,
        interest_rate: interestRate,
        monthly_minimum: monthlyMin,
        total_paid: 0,
        is_closed: false,
        expected_payoff_date: expectedPayoffDate ?? null,
        interest_type: interestType,
        loan_tenure_months: loanTenureMonths,
        total_repayable: totalRepayable,
        created_at: now,
        updated_at: now,
      });

      await enqueue({
        table: "debts",
        operation: "INSERT",
        recordId: tempId,
        tempId,
        payload: { name, type, principal, interestRate, monthlyMin, expectedPayoffDate, interestType, loanTenureMonths },
      });

      return { id: tempId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DEBT_KEY });
      qc.invalidateQueries({ queryKey: NET_WORTH_KEY });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}

export function useUpdateDebt() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        name?: string;
        type?: "internal" | "external" | "lent";
        principal?: number;
        interest_rate?: number;
        monthly_minimum?: number;
        expected_payoff_date?: string | null;
        is_closed?: boolean;
        interest_type?: "flat" | "diminishing";
        loan_tenure_months?: number | null;
        total_repayable?: number;
      };
    }) => {
      const db = getDB();

      // Recalculate total_repayable locally if relevant fields change
      if (
        updates.principal !== undefined ||
        updates.interest_rate !== undefined ||
        updates.loan_tenure_months !== undefined ||
        updates.interest_type !== undefined
      ) {
        const current = await db.debts.get(id);
        if (current) {
          const principal = updates.principal ?? Number(current.principal);
          const rate = updates.interest_rate ?? Number(current.interest_rate);
          const tenure = updates.loan_tenure_months !== undefined ? updates.loan_tenure_months : current.loan_tenure_months;
          const iType = updates.interest_type ?? current.interest_type ?? "flat";
          updates.total_repayable = calcTotalRepayable(principal, rate, tenure, iType);
        }
      }

      await db.debts.update(id, {
        ...updates,
        updated_at: new Date().toISOString(),
      });
      await enqueue({
        table: "debts",
        operation: "UPDATE",
        recordId: id,
        payload: { id, updates },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DEBT_KEY });
      qc.invalidateQueries({ queryKey: NET_WORTH_KEY });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}

export function useDeleteDebt() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async (id: string) => {
      const db = getDB();
      await db.debts.delete(id);
      const linkedItems = await db.budget_items
        .where({ link_type: "debt", link_id: id })
        .toArray();
      for (const item of linkedItems) {
        await db.budget_items.update(item.id, { link_type: null, link_id: null });
      }
      await enqueue({
        table: "debts",
        operation: "DELETE",
        recordId: id,
        payload: { id },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DEBT_KEY });
      qc.invalidateQueries({ queryKey: NET_WORTH_KEY });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}

export function useMakePayment() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const db = getDB();
      const debt = await db.debts.get(id);
      if (debt) {
        const newTotalPaid = Number(debt.total_paid) + amount;
        const repayableTarget = Number(debt.total_repayable) > 0
          ? Number(debt.total_repayable)
          : Number(debt.principal);
        const isClosed = newTotalPaid >= repayableTarget;
        await db.debts.update(id, {
          total_paid: newTotalPaid,
          is_closed: isClosed || debt.is_closed,
          updated_at: new Date().toISOString(),
        });
      }
      await enqueue({
        table: "debts",
        operation: "PAYMENT",
        recordId: id,
        payload: { id, amount },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DEBT_KEY });
      qc.invalidateQueries({ queryKey: DEBT_TREND_KEY });
      qc.invalidateQueries({ queryKey: NET_WORTH_KEY });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}

export function useUpdateDebtIcon() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({ id, icon }: { id: string; icon: string }) => {
      const db = getDB();
      await db.debts.update(id, { icon, updated_at: new Date().toISOString() });
      await enqueue({
        table: "debts",
        operation: "UPDATE",
        recordId: id,
        payload: { id, updates: { icon } },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DEBT_KEY });
    },
  });
}
