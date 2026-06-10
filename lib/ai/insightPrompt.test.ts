import { describe, expect, it } from "vitest";
import {
  buildInsightPrompt,
  parseInsightResponse,
} from "./insightPrompt";
import type { InsightStats } from "@/lib/sms/insightStats";

const stats: InsightStats = {
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
  overCats: [{ name: "Dining", planned: 3000, actual: 3500 }],
  paceRiskCats: [{ name: "Shopping", planned: 5000, actual: 2000 }],
  goals: [{ name: "Emergency Fund", current: 25000, target: 50000, pct: 50 }],
  pendingCount: 2,
};

/** Wrap a model content string in the OpenRouter response shape. */
function asResponse(content: unknown) {
  return { choices: [{ message: { content } }] };
}

describe("buildInsightPrompt", () => {
  it("includes pace, over-budget, pace-risk and goal sections", () => {
    const p = buildInsightPrompt(stats);
    expect(p).toContain("Currency: INR");
    expect(p).toMatch(/Projected month-end/);
    expect(p).toContain("Dining"); // over budget
    expect(p).toContain("Shopping"); // pace risk
    expect(p).toContain("Emergency Fund"); // goal
    expect(p).toMatch(/uncategorized/i); // pending spends
  });

  it("notes when no budget is set", () => {
    const p = buildInsightPrompt({ ...stats, monthBudget: 0 });
    expect(p).toMatch(/No budget set/i);
  });
});

describe("parseInsightResponse", () => {
  it("parses a valid JSON content payload", () => {
    const out = parseInsightResponse(
      asResponse(JSON.stringify({ title: "🐾 Heads up", body: "Dining is over." })),
    );
    expect(out).toEqual({ title: "🐾 Heads up", body: "Dining is over." });
  });

  it("returns null for non-JSON content", () => {
    expect(parseInsightResponse(asResponse("not json at all"))).toBeNull();
  });

  it("returns null when title or body is missing", () => {
    expect(
      parseInsightResponse(asResponse(JSON.stringify({ title: "only title" }))),
    ).toBeNull();
  });

  it("returns null when content is not a string", () => {
    expect(parseInsightResponse(asResponse(undefined))).toBeNull();
    expect(parseInsightResponse({})).toBeNull();
    expect(parseInsightResponse(null)).toBeNull();
  });

  it("trims overly long title and body", () => {
    const out = parseInsightResponse(
      asResponse(
        JSON.stringify({ title: "x".repeat(200), body: "y".repeat(400) }),
      ),
    );
    expect(out!.title.length).toBe(60);
    expect(out!.body.length).toBe(160);
  });
});
