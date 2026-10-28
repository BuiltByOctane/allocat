import { describe, it, expect } from "vitest";
import {
  addDays,
  clampStartDay,
  computeRange,
  daysElapsed,
  daysLeft,
  findCoveringBudget,
  formatPeriodLabel,
  labelForDate,
  periodDays,
  planStartDaySwitch,
  rangeForLabel,
  resolvePeriod,
  stepResolved,
  toISODate,
  type StoredBudgetPeriod,
} from "./period";

const oct1: StoredBudgetPeriod = { id: "oct", month: 10, year: 2026, period_start: "2026-10-01", period_end: "2026-10-31" };
const oct15: StoredBudgetPeriod = { id: "oct", month: 10, year: 2026, period_start: "2026-10-15", period_end: "2026-11-14" };

describe("period", () => {
  describe("computeRange", () => {
    it("computes start-day ranges across month/year/leap boundaries", () => {
      expect(computeRange({ month: 10, year: 2026 }, 15)).toEqual({ start: "2026-10-15", end: "2026-11-14" });
      expect(computeRange({ month: 12, year: 2026 }, 15)).toEqual({ start: "2026-12-15", end: "2027-01-14" });
      expect(computeRange({ month: 2, year: 2028 }, 1)).toEqual({ start: "2028-02-01", end: "2028-02-29" });
      expect(computeRange({ month: 1, year: 2026 }, 28)).toEqual({ start: "2026-01-28", end: "2026-02-27" });
    });
  });

  describe("labelForDate", () => {
    it("labels a date by the month its cycle started in", () => {
      expect(labelForDate("2026-10-14", 15)).toEqual({ month: 9, year: 2026 });
      expect(labelForDate("2026-10-15", 15)).toEqual({ month: 10, year: 2026 });
      expect(labelForDate("2027-01-03", 15)).toEqual({ month: 12, year: 2026 });
      expect(labelForDate("2026-10-31", 1)).toEqual({ month: 10, year: 2026 });
    });
  });

  describe("date helpers", () => {
    it("addDays crosses month, year and leap boundaries", () => {
      expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
      expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
      expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
      expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    });

    it("toISODate uses local calendar fields", () => {
      expect(toISODate(new Date(2026, 9, 5, 23, 59))).toBe("2026-10-05");
      expect(toISODate(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
    });
  });

  describe("resolvePeriod", () => {
    it("a stored budget containing the date wins", () => {
      const budgets = [{ ...oct1, period_end: "2026-11-14" }];
      expect(resolvePeriod("2026-11-10", budgets, 15)).toMatchObject({ month: 10, budgetId: "oct", end: "2026-11-14" });
      expect(resolvePeriod("2026-11-15", budgets, 15)).toMatchObject({ month: 11, start: "2026-11-15", budgetId: null });
    });

    it("clips the computed range so it never overlaps a stored budget", () => {
      const sep: StoredBudgetPeriod = { id: "sep", month: 9, year: 2026, period_start: "2026-09-01", period_end: "2026-09-30" };
      expect(resolvePeriod("2026-10-05", [sep], 15)).toEqual({
        month: 9,
        year: 2026,
        start: "2026-10-01",
        end: "2026-10-14",
        budgetId: null,
      });
    });

    it("clips the computed end before the next stored budget", () => {
      const nov: StoredBudgetPeriod = { id: "nov", month: 11, year: 2026, period_start: "2026-11-01", period_end: "2026-11-30" };
      expect(resolvePeriod("2026-10-20", [nov], 15)).toEqual({
        month: 10,
        year: 2026,
        start: "2026-10-15",
        end: "2026-10-31",
        budgetId: null,
      });
    });

    it("treats a stored row without a range as its calendar month", () => {
      const legacy: StoredBudgetPeriod = { id: "oct", month: 10, year: 2026, period_start: null, period_end: undefined };
      expect(resolvePeriod("2026-10-20", [legacy], 15)).toEqual({
        month: 10,
        year: 2026,
        start: "2026-10-01",
        end: "2026-10-31",
        budgetId: "oct",
      });
      const empty: StoredBudgetPeriod = { id: "oct", month: 10, year: 2026, period_start: "", period_end: "" };
      expect(resolvePeriod("2026-10-03", [empty], 15)).toMatchObject({ budgetId: "oct", start: "2026-10-01" });
    });
  });

  describe("rangeForLabel", () => {
    it("stored row wins, else computed", () => {
      expect(rangeForLabel({ month: 10, year: 2026 }, [oct1], 15)).toEqual({
        month: 10, year: 2026, start: "2026-10-01", end: "2026-10-31", budgetId: "oct",
      });
      expect(rangeForLabel({ month: 11, year: 2026 }, [oct1], 15)).toEqual({
        month: 11, year: 2026, start: "2026-11-15", end: "2026-12-14", budgetId: null,
      });
    });
  });

  describe("stepResolved", () => {
    it("skips absorbed labels in both directions", () => {
      const budgets: StoredBudgetPeriod[] = [
        { id: "oct", month: 10, year: 2026, period_start: "2026-10-15", period_end: "2026-11-30" },
      ];
      const oct = resolvePeriod("2026-10-20", budgets, 1);
      expect(oct.budgetId).toBe("oct");
      const next = stepResolved(oct, 1, budgets, 1);
      expect(next).toMatchObject({ month: 12, year: 2026, start: "2026-12-01" });
      expect(stepResolved(next, -1, budgets, 1).budgetId).toBe("oct");
    });
  });

  describe("day counts", () => {
    const r = { start: "2026-10-15", end: "2026-11-14" };
    it("counts inclusive days", () => {
      expect(daysElapsed(r, "2026-10-15")).toBe(1);
      expect(daysLeft(r, "2026-11-14")).toBe(0);
      expect(periodDays(r)).toBe(31);
    });
  });

  describe("formatPeriodLabel", () => {
    it("uses the month name for calendar cycles and a range otherwise", () => {
      expect(formatPeriodLabel(resolvePeriod("2026-10-10", [], 1), 1)).toBe("October 2026");
      expect(formatPeriodLabel(resolvePeriod("2026-10-20", [], 15), 15)).toBe("Oct 15 – Nov 14");
    });
  });

  describe("clampStartDay", () => {
    it("coerces anything invalid to 1", () => {
      expect(clampStartDay(0)).toBe(1);
      expect(clampStartDay(29)).toBe(1);
      expect(clampStartDay("15")).toBe(1);
      expect(clampStartDay(null)).toBe(1);
      expect(clampStartDay(15)).toBe(15);
    });
  });

  describe("planStartDaySwitch", () => {
    it("1 → 15 late in the month extends the current budget", () => {
      const plan = planStartDaySwitch({ today: "2026-10-28", oldStartDay: 1, newStartDay: 15, budgets: [oct1] })!;
      expect(plan.current).toMatchObject({ start: "2026-10-01", end: "2026-11-14" });
      expect(plan.nextStart).toBe("2026-11-15");
      expect(plan.deleteBudgetIds).toEqual([]);
    });

    it("1 → 15 early in the month extends the current budget", () => {
      const plan = planStartDaySwitch({ today: "2026-10-10", oldStartDay: 1, newStartDay: 15, budgets: [oct1] })!;
      expect(plan.current).toMatchObject({ start: "2026-10-01", end: "2026-11-14" });
      expect(plan.nextStart).toBe("2026-11-15");
      expect(plan.deleteBudgetIds).toEqual([]);
    });

    it("15 → 1 before month end shortens the current budget", () => {
      const plan = planStartDaySwitch({ today: "2026-10-20", oldStartDay: 15, newStartDay: 1, budgets: [oct15] })!;
      expect(plan.current).toMatchObject({ start: "2026-10-15", end: "2026-10-31" });
      expect(plan.nextStart).toBe("2026-11-01");
      expect(plan.deleteBudgetIds).toEqual([]);
    });

    it("15 → 1 after month end absorbs and deletes the next label", () => {
      const nov: StoredBudgetPeriod = { id: "nov", month: 11, year: 2026, period_start: "2026-11-15", period_end: "2026-12-14" };
      const plan = planStartDaySwitch({ today: "2026-11-05", oldStartDay: 15, newStartDay: 1, budgets: [oct15, nov] })!;
      expect(plan.current).toMatchObject({ budgetId: "oct", start: "2026-10-15", end: "2026-11-30" });
      expect(plan.nextStart).toBe("2026-12-01");
      expect(plan.deleteBudgetIds).toEqual(["nov"]);
      expect(plan.deleteLabels).toEqual([{ month: 11, year: 2026 }]);
    });

    it("redates future budgets to the new start day", () => {
      const dec: StoredBudgetPeriod = { id: "dec", month: 12, year: 2026, period_start: "2026-12-01", period_end: "2026-12-31" };
      const plan = planStartDaySwitch({ today: "2026-10-28", oldStartDay: 1, newStartDay: 15, budgets: [oct1, dec] })!;
      expect(plan.redate).toEqual([{ budgetId: "dec", start: "2026-12-15", end: "2027-01-14" }]);
      expect(plan.deleteBudgetIds).toEqual([]);
    });

    it("plans a current range even without a current row", () => {
      const sep: StoredBudgetPeriod = { id: "sep", month: 9, year: 2026, period_start: "2026-09-01", period_end: "2026-09-30" };
      const plan = planStartDaySwitch({ today: "2026-10-28", oldStartDay: 1, newStartDay: 15, budgets: [sep] })!;
      expect(plan.current).toEqual({ budgetId: null, month: 10, year: 2026, start: "2026-10-01", end: "2026-11-14" });
      expect(plan.redate).toEqual([]);
      expect(plan.deleteBudgetIds).toEqual([]);
    });

    it("extends the stored budget sharing the current label instead of colliding", () => {
      const sep: StoredBudgetPeriod = { id: "sep", month: 9, year: 2026, period_start: "2026-09-01", period_end: "2026-09-30" };
      const plan = planStartDaySwitch({ today: "2026-10-05", oldStartDay: 15, newStartDay: 1, budgets: [sep] })!;
      expect(plan.current).toEqual({ budgetId: "sep", month: 9, year: 2026, start: "2026-09-01", end: "2026-10-31" });
      expect(plan.nextStart).toBe("2026-11-01");
      expect(plan.deleteBudgetIds).toEqual([]);
    });

    it("no budgets → current null; same day → null", () => {
      expect(planStartDaySwitch({ today: "2026-10-28", oldStartDay: 1, newStartDay: 15, budgets: [] })).toEqual({
        startDay: 15, current: null, deleteBudgetIds: [], deleteLabels: [], redate: [], nextStart: null,
      });
      expect(planStartDaySwitch({ today: "2026-10-28", oldStartDay: 15, newStartDay: 15, budgets: [oct1] })).toBeNull();
    });
  });
  describe("findCoveringBudget", () => {
    // After a 15 → 1 switch on Nov 5: October stretched to Oct 15 – Nov 30.
    const octStretched: StoredBudgetPeriod = { id: "oct", month: 10, year: 2026, period_start: "2026-10-15", period_end: "2026-11-30" };

    it("returns the stored budget of another label containing the computed start", () => {
      const nov = rangeForLabel({ month: 11, year: 2026 }, [octStretched], 1);
      expect(findCoveringBudget(nov, [octStretched])).toBe(octStretched);
    });

    it("is null when the label has its own stored row", () => {
      expect(findCoveringBudget(rangeForLabel({ month: 10, year: 2026 }, [octStretched], 1), [octStretched])).toBeNull();
    });

    it("is null when no stored budget contains the start", () => {
      const dec = rangeForLabel({ month: 12, year: 2026 }, [octStretched], 1);
      expect(findCoveringBudget(dec, [octStretched])).toBeNull();
      expect(findCoveringBudget(rangeForLabel({ month: 11, year: 2026 }, [], 1), [])).toBeNull();
    });

    it("is null for start-day-1 calendar months next to each other", () => {
      const nov = rangeForLabel({ month: 11, year: 2026 }, [oct1], 1);
      expect(findCoveringBudget(nov, [oct1])).toBeNull();
    });

    it("treats a stored row missing its range as its calendar month", () => {
      const legacy: StoredBudgetPeriod = { id: "sep", month: 9, year: 2026 };
      const label = rangeForLabel({ month: 10, year: 2026 }, [legacy], 1);
      expect(findCoveringBudget(label, [legacy])).toBeNull();
      const shifted = { ...rangeForLabel({ month: 10, year: 2026 }, [], 1), start: "2026-09-20" };
      expect(findCoveringBudget(shifted, [legacy])).toBe(legacy);
    });
  });
});
