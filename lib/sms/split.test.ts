import { describe, it, expect } from "vitest";
import {
  splitRemainder,
  validateSplit,
  resolveSplitAmounts,
  smsSplitDedupeKey,
  manualSplitDedupeKey,
} from "./split";

describe("split maths", () => {
  it("remainder rounds to cents", () => {
    expect(splitRemainder(1000, [333.33, 333.33])).toBe(333.34);
    expect(splitRemainder(2400, [1500, 600])).toBe(300);
  });
  it("validateSplit ok", () => {
    expect(
      validateSplit(2400, [
        { budgetItemId: "a", amount: 1500 },
        { budgetItemId: "b", amount: 600 },
        { budgetItemId: "c", amount: null },
      ]),
    ).toEqual({ ok: true, remainder: 300, issues: [] });
  });
  it("too few parts", () => {
    expect(validateSplit(100, [{ budgetItemId: "a", amount: null }]).issues).toContain("too_few_parts");
  });
  it("duplicate item", () => {
    expect(
      validateSplit(300, [
        { budgetItemId: "a", amount: 100 },
        { budgetItemId: "a", amount: null },
      ]).issues,
    ).toContain("duplicate_item");
  });
  it("missing item", () => {
    expect(
      validateSplit(300, [
        { budgetItemId: "", amount: 100 },
        { budgetItemId: "b", amount: null },
      ]).issues,
    ).toContain("missing_item");
  });
  it("bad amount", () => {
    for (const amount of [null, 0, -5]) {
      expect(
        validateSplit(300, [
          { budgetItemId: "a", amount },
          { budgetItemId: "b", amount: null },
        ]).issues,
      ).toContain("bad_amount");
    }
  });
  it("remainder_not_positive", () => {
    const r0 = validateSplit(1000, [
      { budgetItemId: "a", amount: 1000 },
      { budgetItemId: "b", amount: null },
    ]);
    expect(r0.remainder).toBe(0);
    expect(r0.issues).toContain("remainder_not_positive");
    const r1 = validateSplit(1000, [
      { budgetItemId: "a", amount: 1200 },
      { budgetItemId: "b", amount: null },
    ]);
    expect(r1.remainder).toBe(-200);
    expect(r1.issues).toContain("remainder_not_positive");
  });
  it("resolveSplitAmounts", () => {
    expect(
      resolveSplitAmounts(2400, [
        { budgetItemId: "a", amount: 1500 },
        { budgetItemId: "b", amount: 600 },
        { budgetItemId: "c", amount: null },
      ]),
    ).toEqual([1500, 600, 300]);
  });
  it("keys", () => {
    expect(smsSplitDedupeKey("abc", "s1", 2)).toBe("abc#split:s1:2");
    expect(manualSplitDedupeKey("s1", 1)).toBe("manual_split:s1:1");
  });
});
