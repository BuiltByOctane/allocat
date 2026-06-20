import { describe, it, expect } from "vitest";
import { hasMeaningfulData, isDashboardEmpty } from "./dashboard-empty";

const empty = { budget: null, categories: [], goals: [], netWorthHistory: [] };

describe("dashboard-empty", () => {
  it("treats a fully empty dataset as empty", () => {
    expect(hasMeaningfulData(empty)).toBe(false);
    expect(isDashboardEmpty(empty)).toBe(true);
  });

  it("treats null/undefined as empty", () => {
    expect(isDashboardEmpty(null)).toBe(true);
    expect(isDashboardEmpty(undefined)).toBe(true);
  });

  // The phantom-budget bug: a zero-value budget row with no categories must NOT
  // count as meaningful, or the dashboard flips out of its empty state into a
  // zero-data UI after a refresh.
  it("ignores a zero-total budget with no categories", () => {
    expect(
      isDashboardEmpty({ ...empty, budget: { totalBudget: 0 }, categories: [] })
    ).toBe(true);
  });

  it("counts a budget with a positive total", () => {
    expect(
      hasMeaningfulData({ ...empty, budget: { totalBudget: 5000 } })
    ).toBe(true);
  });

  it("counts a zero-total budget that has categories", () => {
    expect(
      hasMeaningfulData({
        ...empty,
        budget: { totalBudget: 0 },
        categories: [{ id: "c1" }],
      })
    ).toBe(true);
  });

  it("counts goals or net-worth history alone", () => {
    expect(hasMeaningfulData({ ...empty, goals: [{}] })).toBe(true);
    expect(hasMeaningfulData({ ...empty, netWorthHistory: [{}] })).toBe(true);
  });
});
