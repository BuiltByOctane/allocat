import { describe, it, expect } from "vitest";
import { computeAutoCompletion } from "./budget-completion";

describe("computeAutoCompletion", () => {
  it("completes when actual reaches planned", () => {
    expect(computeAutoCompletion(1000, 1000)).toBe(true);
  });
  it("completes when actual exceeds planned (overspend)", () => {
    expect(computeAutoCompletion(1000, 1500)).toBe(true);
  });
  it("is not complete below planned", () => {
    expect(computeAutoCompletion(1000, 999)).toBe(false);
  });
  it("re-opens (two-way) when spend drops below planned", () => {
    expect(computeAutoCompletion(1000, 0)).toBe(false);
  });
  it("never completes a zero-planned item", () => {
    expect(computeAutoCompletion(0, 0)).toBe(false);
  });
});
