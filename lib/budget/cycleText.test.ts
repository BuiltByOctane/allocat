import { describe, expect, it } from "vitest";
import {
  absorbedWarning,
  cycleRangeText,
  ordinal,
  shortDate,
  switchPreviewText,
} from "@/lib/budget/cycleText";
import type { SwitchPlan } from "@/lib/budget/period";

describe("ordinal", () => {
  it.each([
    [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [11, "11th"], [12, "12th"],
    [13, "13th"], [14, "14th"], [21, "21st"], [22, "22nd"], [23, "23rd"], [28, "28th"],
  ])("%i ⇒ %s", (n, s) => expect(ordinal(n)).toBe(s));
});

describe("cycleRangeText", () => {
  it("start day 1 runs to month end", () => expect(cycleRangeText(1)).toBe("1st → month end"));
  it("start day 15 ⇒ 15th → 14th", () => expect(cycleRangeText(15)).toBe("15th → 14th"));
  it("start day 2 ⇒ 2nd → 1st", () => expect(cycleRangeText(2)).toBe("2nd → 1st"));
});

describe("shortDate", () => {
  it("formats en-US short", () => expect(shortDate("2026-11-14")).toBe("Nov 14"));
  it("no timezone shift on the 1st", () => expect(shortDate("2027-01-01")).toBe("Jan 1"));
});

const plan: SwitchPlan = {
  startDay: 15,
  current: { budgetId: "b-oct", month: 10, year: 2026, start: "2026-10-01", end: "2026-11-14" },
  deleteBudgetIds: ["b-nov"],
  deleteLabels: [{ month: 11, year: 2026 }],
  redate: [],
  nextStart: "2026-11-15",
};

describe("switchPreviewText", () => {
  it("uses the exact copy", () => {
    expect(switchPreviewText(plan)).toBe(
      "Your current budget will run Oct 1 – Nov 14 (45 days). From then on, each budget runs 15th → 14th.",
    );
  });
  it("start day 1 ends at month end", () => {
    const p: SwitchPlan = {
      ...plan,
      startDay: 1,
      current: { budgetId: "b", month: 10, year: 2026, start: "2026-10-15", end: "2026-11-30" },
    };
    expect(switchPreviewText(p)).toBe(
      "Your current budget will run Oct 15 – Nov 30 (47 days). From then on, each budget runs 1st → month end.",
    );
  });
  it("no budgets yet ⇒ short line", () => {
    expect(switchPreviewText({ ...plan, current: null, deleteBudgetIds: [], deleteLabels: [] })).toBe(
      "Your budgets will run 15th → 14th.",
    );
  });
});

describe("absorbedWarning", () => {
  it("uses the exact copy", () => {
    expect(absorbedWarning({ month: 11, year: 2026 }, plan.current!)).toBe(
      "Your November plan will be removed. October now runs until Nov 14.",
    );
  });
});
