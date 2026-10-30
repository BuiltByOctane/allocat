import { describe, expect, it } from "vitest";
import { initSplitParts, splitPartsReducer, validateSplit } from "./split";

describe("splitPartsReducer", () => {
  it("starts with two parts", () => {
    expect(initSplitParts("a").parts).toEqual([
      { budgetItemId: "a", amount: null },
      { budgetItemId: "", amount: null },
    ]);
  });

  it("add part moves auto to new last row", () => {
    const s = {
      parts: [
        { budgetItemId: "a", amount: 1500 },
        { budgetItemId: "b", amount: null },
      ],
    };
    expect(splitPartsReducer(s, { type: "add", total: 2400 }).parts).toEqual([
      { budgetItemId: "a", amount: 1500 },
      { budgetItemId: "b", amount: 900 },
      { budgetItemId: "", amount: null },
    ]);
  });

  it("remove is a no-op at two parts", () => {
    const s = initSplitParts("a");
    expect(splitPartsReducer(s, { type: "remove", index: 0 })).toBe(s);
  });

  it("remove drops a row beyond two and keeps the last auto", () => {
    const s = {
      parts: [
        { budgetItemId: "a", amount: 1 },
        { budgetItemId: "b", amount: 2 },
        { budgetItemId: "c", amount: null },
      ],
    };
    expect(splitPartsReducer(s, { type: "remove", index: 1 }).parts).toEqual([
      { budgetItemId: "a", amount: 1 },
      { budgetItemId: "c", amount: null },
    ]);
  });

  it("setItem and setAmount update one row", () => {
    let s = initSplitParts();
    s = splitPartsReducer(s, { type: "setItem", index: 1, itemId: "z" });
    s = splitPartsReducer(s, { type: "setAmount", index: 0, amount: 5 });
    expect(s.parts).toEqual([
      { budgetItemId: "", amount: 5 },
      { budgetItemId: "z", amount: null },
    ]);
  });

  it("remainder follows total", () => {
    const parts = [
      { budgetItemId: "a", amount: 1500 },
      { budgetItemId: "b", amount: null },
    ];
    expect(validateSplit(2000, parts).remainder).toBe(500);
  });

  it("remainder <= 0 is invalid", () => {
    const parts = [
      { budgetItemId: "a", amount: 1000 },
      { budgetItemId: "b", amount: null },
    ];
    expect(validateSplit(1000, parts).ok).toBe(false);
  });
});
