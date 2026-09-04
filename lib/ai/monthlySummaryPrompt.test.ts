import { describe, expect, it } from "vitest";
import {
  buildMonthlySummaryPrompt,
  parseMonthlySummaryResponse,
  type MonthlySummaryStats,
} from "./monthlySummaryPrompt";

const stats: MonthlySummaryStats = {
  currency: "INR",
  monthLabel: "August 2026",
  totalBudget: 50000,
  totalAllocated: 48000,
  totalSpent: 42000,
  txnCount: 34,
  pendingCount: 0,
  pendingAmount: 0,
  categories: [
    { name: "Food", allocated: 10000, spent: 12000 },
    { name: "Transport", allocated: 5000, spent: 3000 },
  ],
  topMerchants: [
    { label: "Swiggy", amount: 4000 },
    { label: "Uber", amount: 2500 },
  ],
};

/** Wrap a model content string in the OpenRouter response shape. */
function asResponse(content: unknown) {
  return { choices: [{ message: { content } }] };
}

describe("buildMonthlySummaryPrompt", () => {
  it("includes totals, transaction status, categories and top spends", () => {
    const p = buildMonthlySummaryPrompt(stats);
    expect(p).toContain("Currency: INR");
    expect(p).toContain("Month: August 2026");
    expect(p).toMatch(/under budget/); // 42k spent of 50k
    expect(p).toMatch(/All 34 transaction/); // nothing pending
    expect(p).toContain("Food");
    expect(p).toMatch(/over plan/); // Food spent 12k of 10k
    expect(p).toContain("Swiggy"); // top spend
  });

  it("reports pending transactions with their total amount when some are not allocated", () => {
    const p = buildMonthlySummaryPrompt({
      ...stats,
      pendingCount: 3,
      pendingAmount: 1500,
      txnCount: 31,
    });
    expect(p).toMatch(/31 categorized, 3 still pending/);
    expect(p).toMatch(/1,500 not yet allocated/);
  });

  it("marks over budget when spend exceeds budget", () => {
    const p = buildMonthlySummaryPrompt({ ...stats, totalSpent: 55000 });
    expect(p).toMatch(/over budget/);
  });

  it("notes when no categories were set up", () => {
    const p = buildMonthlySummaryPrompt({ ...stats, categories: [] });
    expect(p).toMatch(/No categories were set up/i);
  });
});

describe("parseMonthlySummaryResponse", () => {
  it("returns the trimmed plain-text summary", () => {
    const out = parseMonthlySummaryResponse(
      asResponse("  - Spent under budget.\n\nSolid month overall.  "),
    );
    expect(out).toBe("- Spent under budget.\n\nSolid month overall.");
  });

  it("returns null for empty content", () => {
    expect(parseMonthlySummaryResponse(asResponse("   "))).toBeNull();
  });

  it("returns null when content is not a string", () => {
    expect(parseMonthlySummaryResponse(asResponse(undefined))).toBeNull();
    expect(parseMonthlySummaryResponse({})).toBeNull();
    expect(parseMonthlySummaryResponse(null)).toBeNull();
  });

  it("caps an overly long summary", () => {
    const out = parseMonthlySummaryResponse(asResponse("x".repeat(2000)));
    expect(out!.length).toBe(1000);
  });
});
