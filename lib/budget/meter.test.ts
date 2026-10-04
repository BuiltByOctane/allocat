import { describe, it, expect } from "vitest";
import { budgetMeter } from "./meter";

describe("budgetMeter", () => {
  it("is full when nothing is spent", () => {
    expect(budgetMeter(0, 1000)).toMatchObject({ leftPct: 100, over: false, low: false, state: "normal" });
  });

  it("drains as spending grows", () => {
    expect(budgetMeter(250, 1000).leftPct).toBe(75);
  });

  it("warns when under 20% is left", () => {
    expect(budgetMeter(850, 1000)).toMatchObject({ low: true, state: "warn" });
    expect(budgetMeter(800, 1000)).toMatchObject({ low: false, state: "normal" });
  });

  it("is empty but not over at exactly the limit", () => {
    expect(budgetMeter(1000, 1000)).toMatchObject({ leftPct: 0, over: false, state: "warn" });
  });

  it("is empty and over once overspent", () => {
    expect(budgetMeter(1500, 1000)).toMatchObject({ leftPct: 0, over: true, low: false, state: "over" });
  });

  it("is empty and neutral with no allocation", () => {
    expect(budgetMeter(50, 0)).toMatchObject({ leftPct: 0, over: false, state: "normal" });
  });
});
