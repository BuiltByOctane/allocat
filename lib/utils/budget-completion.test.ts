import { describe, it, expect } from "vitest";
import {
  computeAutoCompletion,
  actualOnManualComplete,
} from "./budget-completion";

describe("actualOnManualComplete", () => {
  it("bumps actual up to planned when under-spent", () => {
    expect(actualOnManualComplete(1000, 200)).toBe(1000);
  });
  it("keeps actual when it already equals planned", () => {
    expect(actualOnManualComplete(1000, 1000)).toBe(1000);
  });
  it("never reduces an overspend", () => {
    expect(actualOnManualComplete(1000, 1500)).toBe(1500);
  });
  it("handles a zero-planned item (nothing to use)", () => {
    expect(actualOnManualComplete(0, 0)).toBe(0);
  });
});

describe("computeAutoCompletion", () => {
  it("auto-completes when actual reaches planned", () => {
    expect(computeAutoCompletion(1000, 1000, false)).toBe(true);
  });
  it("does not auto-complete below planned", () => {
    expect(computeAutoCompletion(1000, 999, false)).toBe(false);
  });
  it("never auto-uncompletes", () => {
    expect(computeAutoCompletion(1000, 0, true)).toBe(true);
  });
});
