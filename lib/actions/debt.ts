"use server";

import { createClient } from "@/lib/supabase/server";
import { logActivity, fmt, getUserCurrency } from "@/lib/server/activity-logger";
import { calcTotalRepayable } from "@/lib/utils/debt-calc";
import { upsertTodaySnapshot } from "@/lib/actions/asset-history";

export async function getDebtData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: debts, error } = await supabase
    .from("debts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at");

  if (error) throw new Error(error.message);

  return (debts || []).map(d => ({
    id: d.id,
    name: d.name,
    icon: d.icon,
    color: d.color ?? null,
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

export async function addDebt(
  name: string,
  type: "internal" | "external" | "lent",
  principal: number,
  interestRate: number,
  monthlyMin: number,
  expectedPayoffDate?: string | null,
  interestType: "flat" | "diminishing" = "flat",
  loanTenureMonths?: number | null
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const totalRepayable = calcTotalRepayable(principal, interestRate, loanTenureMonths ?? null, interestType);

  const { data, error } = await supabase
    .from("debts")
    .insert({
      user_id: user.id,
      name,
      type,
      principal,
      interest_rate: interestRate,
      monthly_minimum: monthlyMin,
      total_paid: 0,
      expected_payoff_date: expectedPayoffDate || null,
      is_closed: false,
      interest_type: interestType,
      loan_tenure_months: loanTenureMonths ?? null,
      total_repayable: totalRepayable,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  const cur = await getUserCurrency(supabase, user.id);
  await logActivity(supabase, user.id, {
    action_type: "debt_added",
    category: "debts",
    title: `Added debt "${name}"`,
    description: `New ${type} debt "${name}" with principal ${fmt(principal, cur)}`,
    metadata: { debtId: data.id, name, type, principal, currency: cur },
  });

  return data;
}

type DebtUpdate = Partial<{
  name: string;
  principal: number;
  interest_rate: number;
  monthly_minimum: number;
  expected_payoff_date: string | null;
  is_closed: boolean;
  interest_type: "flat" | "diminishing";
  loan_tenure_months: number | null;
  total_paid: number;
  total_repayable: number;
  icon: string;
}>;

export async function updateDebt(id: string, updates: DebtUpdate) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Recalculate total_repayable if any relevant field changed
  const needsRecalc = (
    updates.principal !== undefined ||
    updates.interest_rate !== undefined ||
    updates.loan_tenure_months !== undefined ||
    updates.interest_type !== undefined
  );

  if (needsRecalc) {
    const { data: current } = await supabase
      .from("debts")
      .select("principal, interest_rate, loan_tenure_months, interest_type")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (current) {
      const principal = updates.principal ?? Number(current.principal);
      const rate = updates.interest_rate ?? Number(current.interest_rate);
      const tenure = updates.loan_tenure_months !== undefined ? updates.loan_tenure_months : current.loan_tenure_months;
      const iType = updates.interest_type ?? current.interest_type ?? "flat";
      updates.total_repayable = calcTotalRepayable(principal, rate, tenure, iType);
    }
  }

  const { data, error } = await supabase
    .from("debts")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  const debtName = data.name;
  const cur = await getUserCurrency(supabase, user.id);
  let title: string;
  let action_type: string;
  if (updates.is_closed !== undefined) {
    action_type = updates.is_closed ? "debt_closed" : "debt_reopened";
    title = updates.is_closed ? `Closed debt "${debtName}"` : `Reopened debt "${debtName}"`;
  } else if (updates.principal !== undefined) {
    action_type = "debt_principal_updated";
    title = `Updated "${debtName}" principal to ${fmt(updates.principal, cur)}`;
  } else if (updates.name !== undefined) {
    action_type = "debt_renamed";
    title = `Renamed debt to "${updates.name}"`;
  } else {
    action_type = "debt_updated";
    title = `Updated debt "${debtName}"`;
  }

  await logActivity(supabase, user.id, {
    action_type,
    category: "debts",
    title,
    description: title,
    metadata: {
      debtId: id,
      name: debtName,
      currency: cur,
      ...(updates.principal !== undefined ? { principal: updates.principal } : {}),
    },
  });

  return data;
}

export async function deleteDebt(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: debt } = await supabase
    .from("debts")
    .select("name")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase
    .from("debts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, {
    action_type: "debt_deleted",
    category: "debts",
    title: `Deleted debt "${debt?.name ?? id}"`,
    description: `Debt "${debt?.name ?? id}" was removed`,
    metadata: { debtId: id, name: debt?.name ?? null },
  });

  return true;
}

export async function updateDebtIcon(id: string, icon: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("debts")
    .update({ icon })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function makePayment(id: string, amount: number, options?: { suppressLog?: boolean }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: debt } = await supabase
    .from("debts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!debt) throw new Error("Debt not found");

  const newTotalPaid = Number(debt.total_paid) + Number(amount);
  const repayableTarget = Number(debt.total_repayable) > 0
    ? Number(debt.total_repayable)
    : Number(debt.principal);
  const isClosed = newTotalPaid >= repayableTarget;

  const { data, error } = await supabase
    .from("debts")
    .update({
      total_paid: newTotalPaid,
      is_closed: isClosed || debt.is_closed
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (!options?.suppressLog) {
    const cur = await getUserCurrency(supabase, user.id);
    await logActivity(supabase, user.id, {
      action_type: "debt_payment_made",
      category: "debts",
      title: `Paid ${fmt(amount, cur)} toward "${debt.name}"`,
      description: `Payment of ${fmt(amount, cur)} made on "${debt.name}"`,
      metadata: { debtId: id, debtName: debt.name, amount, totalPaid: newTotalPaid, currency: cur },
    });
  }

  return data;
}

/** Inverse of makePayment — refunds a payment (e.g. when reversing an SMS spend). */
export async function reverseDebtPayment(id: string, amount: number, options?: { suppressLog?: boolean }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: debt } = await supabase
    .from("debts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!debt) throw new Error("Debt not found");

  const newTotalPaid = Math.max(0, Number(debt.total_paid) - Number(amount));
  const repayableTarget = Number(debt.total_repayable) > 0
    ? Number(debt.total_repayable)
    : Number(debt.principal);
  // Dropping below the target reopens the debt.
  const isClosed = newTotalPaid >= repayableTarget;

  const { data, error } = await supabase
    .from("debts")
    .update({ total_paid: newTotalPaid, is_closed: isClosed })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Net-worth liability = principal − total_paid, so a refund moves it.
  await upsertTodaySnapshot();

  if (!options?.suppressLog) {
    const cur = await getUserCurrency(supabase, user.id);
    await logActivity(supabase, user.id, {
      action_type: "debt_payment_reversed",
      category: "debts",
      title: `Reversed ${fmt(amount, cur)} payment on "${debt.name}"`,
      description: `Payment of ${fmt(amount, cur)} reversed on "${debt.name}"`,
      metadata: { debtId: id, debtName: debt.name, amount, totalPaid: newTotalPaid, currency: cur },
    });
  }

  return data;
}

export async function getDebtPaymentTrend() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [{ data: logs }, { data: debts }] = await Promise.all([
    supabase
      .from("activity_logs")
      .select("metadata")
      .eq("user_id", user.id)
      .eq("action_type", "debt_payment_made")
      .gte("created_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("debts")
      .select("principal, total_paid, total_repayable, is_closed, type")
      .eq("user_id", user.id)
      .eq("is_closed", false)
      .neq("type", "lent"),
  ]);

  const paid30d = (logs || []).reduce((sum, log) => {
    return sum + (Number((log.metadata)?.amount) || 0);
  }, 0);

  const totalOutstanding = (debts || []).reduce((sum, d) => {
    const repayable = Number(d.total_repayable) > 0 ? Number(d.total_repayable) : Number(d.principal);
    return sum + Math.max(0, repayable - Number(d.total_paid));
  }, 0);

  const trendPct = totalOutstanding > 0 ? (paid30d / totalOutstanding) * 100 : 0;

  return { paid30d, trendPct, totalOutstanding };
}
