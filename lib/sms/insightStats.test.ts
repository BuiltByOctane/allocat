import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildInsightStats,
  projectMonthSpend,
  pickFlavor,
  type InsightStats,
  type InsightStatsInput,
} from "./insightStats";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function baseStats(over: Partial<InsightStats> = {}): InsightStats {
  return {
    currency: "INR",
    weekTotal: 4000,
    weekCount: 6,
    lastWeekTotal: 5000,
    topCat: "Food",
    topCatAmt: 2500,
    monthBudget: 50000,
    monthSpent: 20000,
    daysElapsed: 10,
    daysInMonth: 30,
    daysLeft: 20,
    projectedMonthSpend: 60000,
    trackedCount: 4,
    overCats: [],
    paceRiskCats: [],
    goals: [],
    pendingCount: 0,
    ...over,
  };
}

describe("projectMonthSpend", () => {
  it("scales spend-so-far to a month-end estimate", () => {
    expect(projectMonthSpend(10000, 10, 30)).toBe(30000);
    expect(projectMonthSpend(7000, 7, 28)).toBe(28000);
  });

  it("returns spend unchanged before any day has elapsed", () => {
    expect(projectMonthSpend(500, 0, 30)).toBe(500);
    expect(projectMonthSpend(500, -1, 30)).toBe(500);
  });

  it("rounds to a whole number", () => {
    expect(projectMonthSpend(1000, 3, 30)).toBe(10000);
    expect(projectMonthSpend(100, 3, 31)).toBe(1033);
  });
});

describe("pickFlavor", () => {
  afterEach(() => vi.restoreAllMocks());

  // Fix the week so flavor selection is deterministic: flavor = floor(now/WEEK)%4.
  function freezeFlavor(flavor: number) {
    vi.spyOn(Date, "now").mockReturnValue(flavor * WEEK_MS);
  }

  it("always returns non-empty title + body", () => {
    for (let f = 0; f < 4; f++) {
      freezeFlavor(f);
      const { title, body } = pickFlavor(baseStats());
      expect(title.length).toBeGreaterThan(0);
      expect(body.length).toBeGreaterThan(0);
      vi.restoreAllMocks();
    }
  });

  it("flavor 2 flags over-budget categories", () => {
    freezeFlavor(2);
    const out = pickFlavor(
      baseStats({ overCats: [{ name: "Food", planned: 1000, actual: 1500 }] }),
    );
    expect(out.body).toMatch(/over/i);
  });

  it("flavor 3 reports week-over-week change", () => {
    freezeFlavor(3);
    const out = pickFlavor(baseStats({ weekTotal: 4000, lastWeekTotal: 5000 }));
    // 20% less than last week → restraint message.
    expect(out.body).toMatch(/less than last/i);
  });
});

describe("buildInsightStats", () => {
  const period = {
    month: 10,
    year: 2026,
    start: "2026-10-15",
    end: "2026-11-14",
    budgetId: "b-oct",
  };

  function input(over: Partial<InsightStatsInput> = {}): InsightStatsInput {
    return {
      sms: [],
      items: [],
      cats: [],
      budgets: [
        { id: "b-oct", month: 10, year: 2026, total_budget: 40000 },
        { id: "b-nov", month: 11, year: 2026, total_budget: 99999 },
      ],
      assets: [],
      currency: "INR",
      now: new Date(2026, 9, 20, 12, 0, 0),
      period,
      ...over,
    };
  }

  it("paces over the budget cycle, not the calendar month", () => {
    const s = buildInsightStats(input());
    expect(s).not.toBeNull();
    expect(s!.daysLeft).toBe(25);
    expect(s!.daysElapsed).toBe(6);
    expect(s!.daysInMonth).toBe(31);
    expect(s!.monthBudget).toBe(40000);
  });

  it("falls back to the label's budget when the period has no budgetId", () => {
    const s = buildInsightStats(input({ period: { ...period, budgetId: null } }));
    expect(s!.monthBudget).toBe(40000);
  });

  it("matches calendar-month behaviour for a start-day-1 cycle", () => {
    const s = buildInsightStats(
      input({
        now: new Date(2026, 9, 10, 12, 0, 0),
        period: { month: 10, year: 2026, start: "2026-10-01", end: "2026-10-31", budgetId: "b-oct" },
      }),
    );
    expect(s!.daysElapsed).toBe(10);
    expect(s!.daysInMonth).toBe(31);
    expect(s!.daysLeft).toBe(21);
  });
});
