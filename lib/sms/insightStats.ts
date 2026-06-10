/**
 * Weekly-insight stats, computed from IDB so they're accurate across foreground
 * and closed-app spends (and work offline). The plain-data shape is sent to the
 * AI server action (must stay serializable — no functions), and also drives the
 * offline template fallback (`pickFlavor`).
 */
import { getDB } from "@/lib/db";
import { formatCurrency } from "@/lib/number-format";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface GoalStat {
  name: string;
  current: number;
  target: number;
  pct: number;
}

export interface CatStat {
  name: string;
  planned: number;
  actual: number;
}

export interface InsightStats {
  currency: string;
  // ── This week's spending ──
  weekTotal: number;
  weekCount: number;
  lastWeekTotal: number;
  topCat: string;
  topCatAmt: number;
  // ── This month's budget pace ──
  monthBudget: number;
  monthSpent: number;
  daysElapsed: number;
  daysInMonth: number;
  daysLeft: number;
  projectedMonthSpend: number;
  trackedCount: number;
  overCats: CatStat[]; // already over their planned amount
  paceRiskCats: CatStat[]; // on track to exceed planned by month-end
  // ── Goals ──
  goals: GoalStat[];
  // ── Suggestions input ──
  pendingCount: number; // uncategorized SMS spends awaiting review
}

/** Linear month-end projection from spend-so-far. Pure + testable. */
export function projectMonthSpend(
  spent: number,
  daysElapsed: number,
  daysInMonth: number,
): number {
  if (daysElapsed <= 0) return spent;
  return Math.round((spent / daysElapsed) * daysInMonth);
}

export async function computeInsightStats(): Promise<InsightStats | null> {
  const db = getDB();
  const now = new Date();
  const nowMs = now.getTime();
  const weekAgo = new Date(nowMs - WEEK_MS).toISOString();
  const twoWeeksAgo = new Date(nowMs - 2 * WEEK_MS).toISOString();

  const [sms, items, cats, budgets, assets, profiles] = await Promise.all([
    db.sms_transactions.toArray(),
    db.budget_items.toArray(),
    db.categories.toArray(),
    db.budgets.toArray(),
    db.assets.toArray(),
    db.profiles.toArray(),
  ]);

  const currency = profiles[0]?.currency ?? "INR";

  const categorized = sms.filter(
    (t) => t.status === "categorized" && typeof t.amount === "number",
  );
  const thisWk = categorized.filter((t) => t.created_at >= weekAgo);
  const lastWk = categorized.filter(
    (t) => t.created_at >= twoWeeksAgo && t.created_at < weekAgo,
  );
  const pendingCount = sms.filter((t) => t.status === "pending").length;

  // ── Top category this week (via item → category) ──
  const itemCat = new Map(items.map((i) => [i.id, i.category_id]));
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const byCat = new Map<string, number>();
  for (const t of thisWk) {
    const cid = t.budget_item_id ? itemCat.get(t.budget_item_id) : undefined;
    if (cid) byCat.set(cid, (byCat.get(cid) ?? 0) + Number(t.amount));
  }
  let topCat = "";
  let topCatAmt = 0;
  for (const [cid, amt] of byCat) {
    if (amt > topCatAmt) {
      topCatAmt = amt;
      topCat = catName.get(cid) ?? "";
    }
  }

  // ── Current-month budget pace ──
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const budget = budgets.find((b) => b.month === month && b.year === year);

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysElapsed = now.getDate();
  const daysLeft = daysInMonth - daysElapsed;

  let monthBudget = 0;
  let monthSpent = 0;
  let trackedCount = 0;
  const overCats: CatStat[] = [];
  const paceRiskCats: CatStat[] = [];

  if (budget) {
    monthBudget = Number(budget.total_budget || 0);
    const budgetCatIds = new Set(
      cats.filter((c) => c.budget_id === budget.id).map((c) => c.id),
    );
    const perCat = new Map<string, { planned: number; actual: number }>();
    for (const it of items) {
      if (!budgetCatIds.has(it.category_id)) continue;
      const agg = perCat.get(it.category_id) ?? { planned: 0, actual: 0 };
      agg.planned += Number(it.planned_amount || 0);
      agg.actual += Number(it.actual_amount || 0);
      perCat.set(it.category_id, agg);
    }
    for (const [cid, { planned, actual }] of perCat) {
      monthSpent += actual;
      if (planned <= 0) continue;
      trackedCount += 1;
      const stat: CatStat = { name: catName.get(cid) ?? "", planned, actual };
      if (actual > planned) {
        overCats.push(stat);
      } else if (projectMonthSpend(actual, daysElapsed, daysInMonth) > planned) {
        paceRiskCats.push(stat);
      }
    }
  }

  const projectedMonthSpend = projectMonthSpend(
    monthSpent,
    daysElapsed,
    daysInMonth,
  );

  // ── Active goals ──
  const goals: GoalStat[] = assets
    .filter((a) => a.is_goal && !a.achieved_at)
    .map((a) => {
      const current = Number(a.value || 0);
      const target = Number(a.target_amount ?? 0);
      const pct = target > 0 ? Math.round((current / target) * 100) : 0;
      return { name: a.name, current, target, pct };
    });

  // Nothing worth saying — no spends, no budget, no goals.
  if (thisWk.length === 0 && monthBudget === 0 && goals.length === 0) {
    return null;
  }

  return {
    currency,
    weekTotal: thisWk.reduce((s, t) => s + Number(t.amount), 0),
    weekCount: thisWk.length,
    lastWeekTotal: lastWk.reduce((s, t) => s + Number(t.amount), 0),
    topCat,
    topCatAmt,
    monthBudget,
    monthSpent,
    daysElapsed,
    daysInMonth,
    daysLeft,
    projectedMonthSpend,
    trackedCount,
    overCats,
    paceRiskCats,
    goals,
    pendingCount,
  };
}

/**
 * Offline / AI-unavailable fallback: a templated weekly recap. Rotates four
 * flavors by week so consecutive weeks differ. Pure (currency comes from stats).
 */
export function pickFlavor(s: InsightStats): { title: string; body: string } {
  const money = (v: number) =>
    formatCurrency(v, { code: s.currency, maximumFractionDigits: 0 });
  const flavor = Math.floor(Date.now() / WEEK_MS) % 4;
  const over = s.overCats.length;

  // 3 = vs-last-week, needs last-week data; otherwise fall through to recap.
  if (flavor === 3 && s.lastWeekTotal > 0) {
    const diff = Math.round(
      ((s.weekTotal - s.lastWeekTotal) / s.lastWeekTotal) * 100,
    );
    if (diff <= -5) {
      return {
        title: "🎉 Week over week",
        body: `${money(s.weekTotal)} this week — ${Math.abs(diff)}% less than last. Nice restraint.`,
      };
    }
    if (diff >= 5) {
      return {
        title: "👀 The cat's watching",
        body: `${money(s.weekTotal)} this week — up ${diff}% on last. Worth a look.`,
      };
    }
    return {
      title: "🐾 Week over week",
      body: `${money(s.weekTotal)} this week — about the same as last. Steady.`,
    };
  }

  if (flavor === 2) {
    if (over > 0) {
      return {
        title: "🙀 The cat's concerned",
        body: `${over} budget${over > 1 ? "s" : ""} over this week. Tap to regroup.`,
      };
    }
    return {
      title: "😺 Smooth week",
      body: `All ${s.trackedCount} budgets on track. The cat approves. ${money(s.weekTotal)} across ${s.weekCount} spend${s.weekCount > 1 ? "s" : ""}.`,
    };
  }

  if (flavor === 1 && s.topCat) {
    return {
      title: "🐾 This week's challenge",
      body: `You spent ${money(s.topCatAmt)} on ${s.topCat}. Think you can beat it? Aim lower this week.`,
    };
  }

  const insight = s.topCat ? ` ${s.topCat} was your big one.` : "";
  return {
    title: "🐾 Your week with AlloCat",
    body: `${money(s.weekTotal)} across ${s.weekCount} spend${s.weekCount > 1 ? "s" : ""}.${insight}`,
  };
}
