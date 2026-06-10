import { afterEach, describe, expect, it, vi } from "vitest";
import { projectMonthSpend, pickFlavor, type InsightStats } from "./insightStats";

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
