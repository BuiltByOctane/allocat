import { describe, it, expect } from "vitest";
import { FREE_LIMITS, isAtLimit, freeHistoryCutoff } from "./limits";

describe("isAtLimit", () => {
  it("never limits a premium user", () => {
    expect(isAtLimit("goals", 999, "premium")).toBe(false);
    expect(isAtLimit("assets", 999, "premium")).toBe(false);
    expect(isAtLimit("debts", 999, "premium")).toBe(false);
  });

  it("blocks a free user who is already at the cap", () => {
    expect(isAtLimit("goals", FREE_LIMITS.goals, "free")).toBe(true);
    expect(isAtLimit("assets", FREE_LIMITS.assets, "free")).toBe(true);
    expect(isAtLimit("debts", FREE_LIMITS.debts, "free")).toBe(true);
  });

  it("allows a free user below the cap", () => {
    expect(isAtLimit("goals", FREE_LIMITS.goals - 1, "free")).toBe(false);
    expect(isAtLimit("assets", 0, "free")).toBe(false);
  });
});

describe("freeHistoryCutoff", () => {
  it("returns null for premium (no clipping)", () => {
    expect(freeHistoryCutoff("premium", new Date("2026-06-14"))).toBeNull();
  });

  it("returns a date historyMonths back for free", () => {
    const cutoff = freeHistoryCutoff("free", new Date("2026-06-14T00:00:00Z"));
    expect(cutoff).not.toBeNull();
    // 3 months before June 14 2026 → March 14 2026
    expect(cutoff!.getUTCFullYear()).toBe(2026);
    expect(cutoff!.getUTCMonth()).toBe(2); // March (0-indexed)
  });
});
