import { describe, expect, it } from "vitest";
import { isAcceptableClientDate, planMatchesExpected } from "@/lib/budget/switchGuard";
import type { SwitchPlan } from "@/lib/budget/period";

describe("isAcceptableClientDate", () => {
  const server = "2026-10-29";
  it("accepts same day and ±1 day", () => {
    expect(isAcceptableClientDate("2026-10-29", server)).toBe(true);
    expect(isAcceptableClientDate("2026-10-28", server)).toBe(true);
    expect(isAcceptableClientDate("2026-10-30", server)).toBe(true);
  });
  it("rejects ±2 days", () => {
    expect(isAcceptableClientDate("2026-10-27", server)).toBe(false);
    expect(isAcceptableClientDate("2026-10-31", server)).toBe(false);
  });
  it("handles month/year wrap", () => {
    expect(isAcceptableClientDate("2027-01-01", "2026-12-31")).toBe(true);
    expect(isAcceptableClientDate("2026-12-31", "2027-01-01")).toBe(true);
  });
  it("rejects malformed or unreal dates", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "2026-1-29", "29-10-2026", "", "2026-10-29T00:00", null, 20261029]) {
      expect(isAcceptableClientDate(bad, server)).toBe(false);
    }
  });
});

const plan = (deleteBudgetIds: string[], end: string | null): SwitchPlan => ({
  startDay: 15,
  current: end ? { budgetId: "b", month: 10, year: 2026, start: "2026-10-01", end } : null,
  deleteBudgetIds,
  deleteLabels: [],
  redate: [],
  nextStart: null,
});

describe("planMatchesExpected", () => {
  it("same ids in a different order ⇒ match", () => {
    expect(planMatchesExpected(plan(["a", "b"], "2026-11-14"), { deleteBudgetIds: ["b", "a"], currentEnd: "2026-11-14" })).toBe(true);
  });
  it("extra server delete ⇒ mismatch", () => {
    expect(planMatchesExpected(plan(["a", "c"], "2026-11-14"), { deleteBudgetIds: ["a"], currentEnd: "2026-11-14" })).toBe(false);
  });
  it("fewer server deletes ⇒ mismatch", () => {
    expect(planMatchesExpected(plan([], "2026-11-14"), { deleteBudgetIds: ["a"], currentEnd: "2026-11-14" })).toBe(false);
  });
  it("different current end ⇒ mismatch", () => {
    expect(planMatchesExpected(plan([], "2026-11-14"), { deleteBudgetIds: [], currentEnd: "2026-11-30" })).toBe(false);
  });
  it("no budgets on either side ⇒ match", () => {
    expect(planMatchesExpected(plan([], null), { deleteBudgetIds: [], currentEnd: null })).toBe(true);
  });
  it("null server plan ⇒ match only when nothing was expected", () => {
    expect(planMatchesExpected(null, { deleteBudgetIds: [], currentEnd: null })).toBe(true);
    expect(planMatchesExpected(null, { deleteBudgetIds: [], currentEnd: "2026-11-14" })).toBe(false);
    expect(planMatchesExpected(null, { deleteBudgetIds: ["a"], currentEnd: null })).toBe(false);
  });
  it("duplicate ids do not fake a match", () => {
    expect(planMatchesExpected(plan(["a", "b"], null), { deleteBudgetIds: ["a", "a"], currentEnd: null })).toBe(false);
  });
});
