"use server";

import { createClient } from "@/lib/supabase/server";
import type { FinanceTopic } from "@/lib/ai-utils";
import { fmt as fmtCurrency, getUserCurrency } from "@/lib/server/activity-logger";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

interface Ctx {
  supabase: SupabaseClient;
  userId: string;
  cur: string;
  fmt: (n: number) => string;
}

async function makeCtx(): Promise<Ctx> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const cur = await getUserCurrency(supabase, user.id);
  return {
    supabase,
    userId: user.id,
    cur,
    fmt: (n: number) => fmtCurrency(n, cur),
  };
}

// ── Budget: categories + every item inside each category ─────────────────────

export async function getBudgetContext(): Promise<string> {
  const ctx = await makeCtx();
  return getBudgetContextWith(ctx);
}

async function getBudgetContextWith({ supabase, userId, fmt }: Ctx): Promise<string> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const monthName = now.toLocaleString("en-US", { month: "long" });

  const { data: budget } = await supabase
    .from("budgets")
    .select("*, categories(*, budget_items(*))")
    .eq("user_id", userId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  if (!budget) return `=== BUDGET — ${monthName} ${year} ===\nNot set yet.`;

  const total = Number(budget.total_budget || 0);
  let totalSpent = 0;
  const categoryBlocks: string[] = [];

  for (const cat of budget.categories ?? []) {
    const items = cat.budget_items ?? [];

    const catAllocated = items.reduce(
      (s: number, i: { planned_amount: number }) => s + Number(i.planned_amount || 0), 0
    );
    const catSpent = items.reduce(
      (s: number, i: { actual_amount: number }) => s + Number(i.actual_amount || 0), 0
    );
    totalSpent += catSpent;

    const overFlag = catSpent > catAllocated ? " [OVER BUDGET]" : "";
    const header = `  [${cat.type.toUpperCase()}] ${cat.name}: ${fmt(catAllocated)} allocated, ${fmt(catSpent)} spent${overFlag}`;

    const itemLines = items.length === 0
      ? ["    - (no items)"]
      : items.map((i: { name: string; planned_amount: number; actual_amount: number; is_completed: boolean }) => {
          const remaining = Number(i.planned_amount) - Number(i.actual_amount);
          const status = i.is_completed ? " ✓" : remaining < 0 ? " [OVER]" : "";
          return `    - ${i.name}: planned ${fmt(Number(i.planned_amount))}, spent ${fmt(Number(i.actual_amount))}, remaining ${fmt(remaining)}${status}`;
        });

    categoryBlocks.push([header, ...itemLines].join("\n"));
  }

  const remaining = total - totalSpent;

  return [
    `=== BUDGET — ${monthName} ${year} ===`,
    `Total Budget: ${fmt(total)}`,
    `Total Spent:  ${fmt(totalSpent)}`,
    `Remaining:    ${fmt(remaining)}${remaining < 0 ? " [OVERSPENT]" : ""}`,
    `Budget Locked: ${budget.is_locked ? "Yes" : "No"}`,
    "",
    "Categories & Items:",
    ...categoryBlocks,
  ].join("\n");
}

// ── Goals ─────────────────────────────────────────────────────────────────────

export async function getGoalsContext(): Promise<string> {
  const ctx = await makeCtx();
  return getGoalsContextWith(ctx);
}

async function getGoalsContextWith({ supabase, userId, fmt }: Ctx): Promise<string> {
  const { data: goals } = await supabase
    .from("assets")
    .select("name, value, target_amount")
    .eq("user_id", userId)
    .eq("is_goal", true)
    .is("achieved_at", null)
    .order("created_at");

  if (!goals || goals.length === 0) return "=== GOALS ===\nNone set yet.";

  const lines = goals.map((g) => {
    const current = Number(g.value);
    const target = Number(g.target_amount ?? 0);
    const pct = target > 0 ? Math.round((current / target) * 100) : 0;
    const gap = target - current;
    return `  - ${g.name}: ${fmt(current)} saved of ${fmt(target)} (${pct}% complete, ${fmt(gap)} remaining)`;
  });

  return ["=== GOALS ===", ...lines].join("\n");
}

// ── Net Worth: assets + receivables (lent) + liabilities (external/internal) ──

export async function getNetWorthContext(): Promise<string> {
  const ctx = await makeCtx();
  return getNetWorthContextWith(ctx);
}

async function getNetWorthContextWith({ supabase, userId, fmt }: Ctx): Promise<string> {
  const [{ data: assets }, { data: debts }, { data: snapshots }] = await Promise.all([
    supabase.from("assets").select("*, asset_categories(name)").eq("user_id", userId).order("created_at"),
    supabase.from("debts").select("*").eq("user_id", userId).eq("is_closed", false),
    supabase
      .from("net_worth_snapshots")
      .select("net_worth, total_assets, total_liabilities, snapshot_date")
      .eq("user_id", userId)
      .order("snapshot_date", { ascending: false })
      .limit(6),
  ]);

  const totalPhysicalAssets = (assets ?? []).reduce((s, a) => s + Number(a.value || 0), 0);

  const totalReceivables = (debts ?? [])
    .filter(d => d.type === "lent")
    .reduce((s, d) => s + (Number(d.principal) - Number(d.total_paid)), 0);

  const totalLiabilities = (debts ?? [])
    .filter(d => d.type !== "lent")
    .reduce((s, d) => s + (Number(d.principal) - Number(d.total_paid)), 0);

  const totalAssets = totalPhysicalAssets + totalReceivables;
  const currentNetWorth = totalAssets - totalLiabilities;

  const assetLines = (assets ?? []).length === 0
    ? ["  (no assets recorded)"]
    : (assets ?? []).map((a) => {
        const catName = (a).asset_categories?.name ?? a.category ?? "Other";
        return `  - ${a.name} [${catName}]: ${fmt(Number(a.value))}`;
      });

  const receivableLines = (debts ?? []).filter(d => d.type === "lent").map(d => {
    const remaining = Number(d.principal) - Number(d.total_paid);
    return `  - ${d.name} (Lent): ${fmt(remaining)} owed to you`;
  });

  const historyLines = (snapshots ?? []).length === 0
    ? ["  (no history yet)"]
    : (snapshots ?? []).map(
        (s) =>
          `  - ${s.snapshot_date}: Net Worth ${fmt(Number(s.net_worth))} (Assets ${fmt(Number(s.total_assets))}, Liabilities ${fmt(Number(s.total_liabilities))})`
      );

  return [
    "=== NET WORTH ===",
    `Current Net Worth: ${fmt(currentNetWorth)} (Assets - Liabilities)`,
    `Total Assets: ${fmt(totalAssets)} (Physical Assets + Receivables)`,
    `Total Liabilities: ${fmt(totalLiabilities)}`,
    "",
    "Physical Assets:",
    ...assetLines,
    receivableLines.length > 0 ? "\nReceivables (Money Owed to You):" : "",
    ...receivableLines,
    "",
    "Net Worth History (last 6 snapshots):",
    ...historyLines,
  ].join("\n");
}

// ── Debts: Distinguish between Liabilities and Receivables ───────────────────

export async function getDebtsContext(): Promise<string> {
  const ctx = await makeCtx();
  return getDebtsContextWith(ctx);
}

async function getDebtsContextWith({ supabase, userId, fmt }: Ctx): Promise<string> {
  const { data: debts } = await supabase
    .from("debts")
    .select("*")
    .eq("user_id", userId)
    .order("is_closed")
    .order("created_at");

  const activeLiabilities = (debts ?? []).filter((d) => !d.is_closed && d.type !== "lent");
  const activeReceivables = (debts ?? []).filter((d) => !d.is_closed && d.type === "lent");

  const closed = (debts ?? []).filter((d) => d.is_closed);

  const fmtDebt = (d: {
    name: string; type: string; principal: number; total_paid: number;
    interest_rate: number; monthly_minimum: number; expected_payoff_date: string | null;
  }) => {
    const remaining = Number(d.principal) - Number(d.total_paid);
    const pct = Number(d.principal) > 0
      ? Math.round((Number(d.total_paid) / Number(d.principal)) * 100)
      : 0;
    return [
      `  - ${d.name} [${d.type.toUpperCase()}]`,
      `    Principal: ${fmt(Number(d.principal))} | Paid: ${fmt(Number(d.total_paid))} | Remaining: ${fmt(remaining)} (${pct}% ${d.type === 'lent' ? 'recovered' : 'paid'})`,
      d.type !== 'lent' ? `    Interest: ${d.interest_rate}% | Monthly minimum: ${fmt(Number(d.monthly_minimum))}` : null,
      d.expected_payoff_date ? `    Expected ${d.type === 'lent' ? 'recovery' : 'payoff'}: ${d.expected_payoff_date}` : "",
    ].filter(Boolean).join("\n");
  };

  return [
    "=== DEBTS & RECEIVABLES ===",
    "Active Debts (Liabilities - You owe):",
    ...(activeLiabilities.length === 0 ? ["  (none)"] : activeLiabilities.map(fmtDebt)),
    "",
    "Money Owed to You (Receivables - Lent to others):",
    ...(activeReceivables.length === 0 ? ["  (none)"] : activeReceivables.map(fmtDebt)),
    "",
    "Closed/Settled Items:",
    ...(closed.length === 0 ? ["  (none)"] : closed.map(fmtDebt)),
  ].join("\n");
}

// ── Reports: locked monthly summaries ────────────────────────────────────────

export async function getReportsContext(): Promise<string> {
  const ctx = await makeCtx();
  return getReportsContextWith(ctx);
}

async function getReportsContextWith({ supabase, userId }: Ctx): Promise<string> {
  const { data: reports } = await supabase
    .from("reports")
    .select("month, year, notes, summary_data")
    .eq("user_id", userId)
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(3);

  if (!reports || reports.length === 0) return "=== PAST REPORTS ===\nNo locked months yet.";

  const lines = reports.map((r) => {
    const label = `${r.year}-${String(r.month).padStart(2, "0")}`;
    return `  - ${label}: ${r.notes ? `Notes: "${r.notes}"` : "(no notes)"}`;
  });

  return ["=== PAST REPORTS (last 3 locked months) ===", ...lines].join("\n");
}

// ── Assemble only the requested sections ──────────────────────────────────────

export async function buildFinancialContext(topics: FinanceTopic[]): Promise<string> {
  const all = topics.includes("all");
  const inc = (t: FinanceTopic) => all || topics.includes(t);

  // Single context fetch shared across all parallel context builders.
  const ctx = await makeCtx();
  const header = `User currency: ${ctx.cur}`;

  const [budget, goals, networth, debts, reports] = await Promise.all([
    inc("budget")   ? getBudgetContextWith(ctx)   : Promise.resolve(null),
    inc("goals")    ? getGoalsContextWith(ctx)    : Promise.resolve(null),
    inc("networth") ? getNetWorthContextWith(ctx) : Promise.resolve(null),
    inc("debts")    ? getDebtsContextWith(ctx)    : Promise.resolve(null),
    all             ? getReportsContextWith(ctx)  : Promise.resolve(null),
  ]);

  return [header, budget, goals, networth, debts, reports]
    .filter(Boolean)
    .join("\n\n");
}
