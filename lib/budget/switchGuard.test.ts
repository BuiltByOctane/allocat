import { describe, expect, it } from "vitest";
import { isAcceptableClientDate, planMatchesExpected, rpcPlanFor } from "@/lib/budget/switchGuard";
import { planStartDaySwitch, type SwitchPlan } from "@/lib/budget/period";

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

describe("rpcPlanFor", () => {
  const today = "2026-10-29";
  const oct = { id: "oct", month: 10, year: 2026, period_start: "2026-10-01", period_end: "2026-10-31" };

  it("first-time choice of 1 (stored null, no budgets) still persists the day", () => {
    const plan = planStartDaySwitch({ today, oldStartDay: 1, newStartDay: 1, budgets: [] });
    expect(plan).toBeNull();
    expect(planMatchesExpected(plan, { deleteBudgetIds: [], currentEnd: null })).toBe(true);
    expect(rpcPlanFor(plan, null, 1)).toEqual({ startDay: 1, current: null, deleteBudgetIds: [], redate: [] });
  });

  it("first-time choice of 1 with an existing day-1 budget persists without touching it", () => {
    const plan = planStartDaySwitch({ today, oldStartDay: 1, newStartDay: 1, budgets: [oct] });
    expect(rpcPlanFor(plan, null, 1)).toEqual({ startDay: 1, current: null, deleteBudgetIds: [], redate: [] });
  });

  it("first-time choice of another day plans from the effective old day 1", () => {
    const plan = planStartDaySwitch({ today, oldStartDay: 1, newStartDay: 15, budgets: [] });
    expect(rpcPlanFor(plan, null, 15)).toEqual({ startDay: 15, current: null, deleteBudgetIds: [], redate: [] });
  });

  it("first-time choice with budgets carries the normal switch plan", () => {
    const plan = planStartDaySwitch({ today, oldStartDay: 1, newStartDay: 15, budgets: [oct] })!;
    expect(rpcPlanFor(plan, null, 15)).toEqual({
      startDay: 15,
      current: plan.current,
      deleteBudgetIds: [],
      redate: [],
    });
  });

  it("an unchanged stored day writes nothing", () => {
    expect(rpcPlanFor(null, 1, 1)).toBeNull();
    expect(rpcPlanFor(null, 15, 15)).toBeNull();
  });

  it("a real switch from a stored day sends the plan with arrays", () => {
    const plan = planStartDaySwitch({ today, oldStartDay: 1, newStartDay: 15, budgets: [oct] })!;
    expect(rpcPlanFor(plan, 1, 15)).toEqual({
      startDay: 15,
      current: plan.current,
      deleteBudgetIds: plan.deleteBudgetIds,
      redate: plan.redate,
    });
  });
});
