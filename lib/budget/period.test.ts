import { describe, it, expect } from "vitest";
import {
  addDays,
  clampStartDay,
  computeRange,
  daysElapsed,
  daysLeft,
  findCoveringBudget,
  findOverlappingBudget,
  pickBudgetForPeriod,
  budgetContainsDate,
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
  describe("stepResolved across a clipped gap", () => {
    const sep: StoredBudgetPeriod = { id: "sep", month: 9, year: 2026, period_start: "2026-09-01", period_end: "2026-09-30" };
    const nov: StoredBudgetPeriod = { id: "nov", month: 11, year: 2026, period_start: "2026-11-15", period_end: "2026-12-14" };
    const budgets = [sep, nov];
    const chain = [
      { month: 9, year: 2026, start: "2026-09-01", end: "2026-09-30", budgetId: "sep" },
      { month: 9, year: 2026, start: "2026-10-01", end: "2026-10-14", budgetId: null },
      { month: 10, year: 2026, start: "2026-10-15", end: "2026-11-14", budgetId: null },
      { month: 11, year: 2026, start: "2026-11-15", end: "2026-12-14", budgetId: "nov" },
      { month: 12, year: 2026, start: "2026-12-15", end: "2027-01-14", budgetId: null },
    ];

    it("steps forward through the gap", () => {
      let cur = resolvePeriod("2026-09-10", budgets, 15);
      expect(cur).toEqual(chain[0]);
      for (const want of chain.slice(1)) {
        cur = stepResolved(cur, 1, budgets, 15);
        expect(cur).toEqual(want);
      }
    });

    it("steps back in exact reverse", () => {
      let cur = resolvePeriod("2026-12-20", budgets, 15);
      expect(cur).toEqual(chain[4]);
      for (const want of chain.slice(0, 4).reverse()) {
        cur = stepResolved(cur, -1, budgets, 15);
        expect(cur).toEqual(want);
      }
    });
  });

  describe("planStartDaySwitch edge cases", () => {
    it("wraps the year (Dec → Jan)", () => {
      const dec: StoredBudgetPeriod = { id: "dec", month: 12, year: 2026, period_start: "2026-12-01", period_end: "2026-12-31" };
      const jan: StoredBudgetPeriod = { id: "jan", month: 1, year: 2027, period_start: "2027-01-01", period_end: "2027-01-31" };
      const plan = planStartDaySwitch({ today: "2026-12-20", oldStartDay: 1, newStartDay: 15, budgets: [dec, jan] })!;
      expect(plan.current).toEqual({ budgetId: "dec", month: 12, year: 2026, start: "2026-12-01", end: "2027-01-14" });
      expect(plan.nextStart).toBe("2027-01-15");
      expect(plan.deleteBudgetIds).toEqual([]);
      expect(plan.redate).toEqual([{ budgetId: "jan", start: "2027-01-15", end: "2027-02-14" }]);
    });

    it("ends the current cycle on a leap day (28 → 1)", () => {
      // Start day 28 cycles: Dec 2027 (past), Jan 2028 (current), Feb, Mar.
      const dec: StoredBudgetPeriod = { id: "dec", month: 12, year: 2027, period_start: "2027-12-28", period_end: "2028-01-27" };
      const jan: StoredBudgetPeriod = { id: "jan", month: 1, year: 2028, period_start: "2028-01-28", period_end: "2028-02-27" };
      const feb: StoredBudgetPeriod = { id: "feb", month: 2, year: 2028, period_start: "2028-02-28", period_end: "2028-03-27" };
      const mar: StoredBudgetPeriod = { id: "mar", month: 3, year: 2028, period_start: "2028-03-28", period_end: "2028-04-27" };
      const plan = planStartDaySwitch({ today: "2028-02-10", oldStartDay: 28, newStartDay: 1, budgets: [dec, jan, feb, mar] })!;
      expect(plan.current).toEqual({ budgetId: "jan", month: 1, year: 2028, start: "2028-01-28", end: "2028-02-29" });
      expect(plan.nextStart).toBe("2028-03-01");
      expect(plan.deleteBudgetIds).toEqual(["feb"]);
      expect(plan.deleteLabels).toEqual([{ month: 2, year: 2028 }]);
      expect(plan.redate).toEqual([{ budgetId: "mar", start: "2028-03-01", end: "2028-03-31" }]);
    });

    it("15 → 1 with several future budgets deletes the absorbed label and redates the rest", () => {
      const sep: StoredBudgetPeriod = { id: "sep", month: 9, year: 2026, period_start: "2026-09-15", period_end: "2026-10-14" };
      const nov: StoredBudgetPeriod = { id: "nov", month: 11, year: 2026, period_start: "2026-11-15", period_end: "2026-12-14" };
      const dec: StoredBudgetPeriod = { id: "dec", month: 12, year: 2026, period_start: "2026-12-15", period_end: "2027-01-14" };
      const jan: StoredBudgetPeriod = { id: "jan", month: 1, year: 2027, period_start: "2027-01-15", period_end: "2027-02-14" };
      const plan = planStartDaySwitch({ today: "2026-11-05", oldStartDay: 15, newStartDay: 1, budgets: [sep, oct15, nov, dec, jan] })!;
      expect(plan.current).toEqual({ budgetId: "oct", month: 10, year: 2026, start: "2026-10-15", end: "2026-11-30" });
      expect(plan.deleteBudgetIds).toEqual(["nov"]);
      expect(plan.redate).toEqual([
        { budgetId: "dec", start: "2026-12-01", end: "2026-12-31" },
        { budgetId: "jan", start: "2027-01-01", end: "2027-01-31" },
      ]);
      expect(plan.nextStart).toBe("2026-12-01");
    });
  });

  describe("budgetContainsDate", () => {
    it("is inclusive on both ends", () => {
      expect(budgetContainsDate(oct15, "2026-10-15")).toBe(true);
      expect(budgetContainsDate(oct15, "2026-11-14")).toBe(true);
      expect(budgetContainsDate(oct15, "2026-10-14")).toBe(false);
      expect(budgetContainsDate(oct15, "2026-11-15")).toBe(false);
    });

    it("treats a missing range as the calendar month of the label", () => {
      const legacy: StoredBudgetPeriod = { id: "sep", month: 9, year: 2026 };
      expect(budgetContainsDate(legacy, "2026-09-30")).toBe(true);
      expect(budgetContainsDate(legacy, "2026-10-01")).toBe(false);
    });
  });

  describe("findOverlappingBudget", () => {
    const sep: StoredBudgetPeriod = { id: "sep", month: 9, year: 2026, period_start: "2026-09-01", period_end: "2026-09-30" };

    it("finds a partial overlap that does not contain the start", () => {
      // Aug at start day 15 (Aug 15 – Sep 14) runs into a stored calendar September.
      const aug = rangeForLabel({ month: 8, year: 2026 }, [sep], 15);
      expect(findOverlappingBudget(aug, [sep])).toBe(sep);
    });

    it("finds a stored budget containing the whole range", () => {
      const octStretched: StoredBudgetPeriod = { id: "oct", month: 10, year: 2026, period_start: "2026-10-15", period_end: "2026-11-30" };
      expect(findOverlappingBudget({ start: "2026-11-01", end: "2026-11-30" }, [octStretched])).toBe(octStretched);
    });

    it("is null for touching but disjoint ranges", () => {
      expect(findOverlappingBudget({ start: "2026-10-01", end: "2026-10-31" }, [sep])).toBeNull();
      expect(findOverlappingBudget({ start: "2026-08-01", end: "2026-08-31" }, [sep])).toBeNull();
    });

    it("ignores the range's own budget", () => {
      const self = rangeForLabel({ month: 9, year: 2026 }, [sep], 1);
      expect(findOverlappingBudget(self, [sep])).toBeNull();
    });

    it("uses the calendar month for a row missing its range", () => {
      const legacy: StoredBudgetPeriod = { id: "sep", month: 9, year: 2026 };
      expect(findOverlappingBudget({ start: "2026-09-30", end: "2026-10-29" }, [legacy])).toBe(legacy);
    });
  });

  describe("pickBudgetForPeriod", () => {
    const period = { month: 10, year: 2026, start: "2026-10-15", end: "2026-11-14", budgetId: "temp_1" };

    it("prefers the row with the resolved id", () => {
      const byId = { ...oct15, id: "temp_1" };
      expect(pickBudgetForPeriod(period, [oct15, byId], "2026-10-20")).toBe(byId);
    });

    it("falls back to a same-label row whose range contains the date (temp id swapped)", () => {
      expect(pickBudgetForPeriod(period, [oct15], "2026-10-20")).toBe(oct15);
    });

    it("rejects a same-label row whose range does not contain the date", () => {
      const noId = { ...period, budgetId: null };
      expect(pickBudgetForPeriod(noId, [oct1], "2026-11-05")).toBeUndefined();
      expect(pickBudgetForPeriod(noId, [oct1], "2026-10-20")).toBe(oct1);
    });

    it("ignores rows of other labels", () => {
      const nov: StoredBudgetPeriod = { id: "nov", month: 11, year: 2026, period_start: "2026-10-01", period_end: "2026-12-01" };
      expect(pickBudgetForPeriod({ ...period, budgetId: null }, [nov], "2026-10-20")).toBeUndefined();
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
