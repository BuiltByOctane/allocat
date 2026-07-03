import { describe, it, expect } from "vitest";
import {
  allocationFromPct,
  recalcPercentageAllocations,
  templateToSetupCategories,
  fitItemsToAllocation,
  resolveEffectiveTotal,
} from "./setupMath";
import { PREDEFINED_TEMPLATES } from "@/lib/budget-templates";

function mkIdFactory(): () => string {
  let n = 0;
  return () => `uuid-${++n}`;
}

describe("allocationFromPct", () => {
  it("rounds pct of total", () => {
    expect(allocationFromPct(50, 50000)).toBe(25000);
    expect(allocationFromPct(30, 99999)).toBe(30000);
  });
  it("returns 0 for null pct or non-positive total", () => {
    expect(allocationFromPct(null, 50000)).toBe(0);
    expect(allocationFromPct(50, 0)).toBe(0);
  });
});

describe("recalcPercentageAllocations", () => {
  it("recalculates only pct-driven categories", () => {
    const cats = [
      { allocationPct: 50, allocation: 1 },
      { allocationPct: null, allocation: 777 },
    ];
    const out = recalcPercentageAllocations(cats, 10000);
    expect(out[0].allocation).toBe(5000);
    expect(out[1].allocation).toBe(777);
  });
});

describe("templateToSetupCategories", () => {
  const fiftyThirtyTwenty = PREDEFINED_TEMPLATES.find((t) => t.id === "50-30-20")!;

  it("converts template categories with pct allocations against the total", () => {
    const cats = templateToSetupCategories(fiftyThirtyTwenty, 50000, mkIdFactory());
    expect(cats).toHaveLength(3);
    expect(cats[0].name).toBe("Needs");
    expect(cats[0].allocation).toBe(25000);
    expect(cats[1].allocation).toBe(15000);
    expect(cats[2].allocation).toBe(10000);
  });

  it("keeps template item identity", () => {
    const cats = templateToSetupCategories(fiftyThirtyTwenty, 50000, mkIdFactory());
    expect(cats[0].items[0].templateItemId).toBe("50-30-20:needs:rent");
  });

  it("assigns unique ids from the factory", () => {
    const cats = templateToSetupCategories(fiftyThirtyTwenty, 50000, mkIdFactory());
    const ids = new Set([...cats.map((c) => c.id), ...cats.flatMap((c) => c.items.map((i) => i.id))]);
    expect(ids.size).toBe(cats.length + cats.flatMap((c) => c.items).length);
  });
});

describe("fitItemsToAllocation", () => {
  it("keeps amounts when they already fit", () => {
    expect(fitItemsToAllocation([{ planned: 100 }, { planned: 200 }], 500)).toEqual([100, 200]);
  });
  it("is a no-op when allocation is 0", () => {
    expect(fitItemsToAllocation([{ planned: 100 }], 0)).toEqual([100]);
  });
  it("scales proportionally so the sum equals the allocation", () => {
    const out = fitItemsToAllocation([{ planned: 300 }, { planned: 100 }], 200);
    expect(out.reduce((a, b) => a + b, 0)).toBe(200);
    expect(out[0]).toBeGreaterThan(out[1]);
  });
  it("largest-remainder rounding keeps the exact sum with awkward splits", () => {
    const out = fitItemsToAllocation([{ planned: 1 }, { planned: 1 }, { planned: 1 }], 2);
    expect(out.reduce((a, b) => a + b, 0)).toBe(2);
    expect(out.every((n) => n >= 0 && Number.isInteger(n))).toBe(true);
  });
  it("all-zero planned amounts stay zero even when over nothing", () => {
    expect(fitItemsToAllocation([{ planned: 0 }, { planned: 0 }], 100)).toEqual([0, 0]);
  });
});

describe("resolveEffectiveTotal", () => {
  it("keeps the entered total when allocations fit", () => {
    expect(resolveEffectiveTotal(50000, 40000)).toEqual({ total: 50000, bumped: false });
  });
  it("bumps to the allocated sum when over-allocated", () => {
    expect(resolveEffectiveTotal(30000, 40000)).toEqual({ total: 40000, bumped: true });
  });
  it("derives the total silently from allocations when blank (zero-based)", () => {
    expect(resolveEffectiveTotal(0, 40000)).toEqual({ total: 40000, bumped: false });
  });
  it("zero everywhere stays zero", () => {
    expect(resolveEffectiveTotal(0, 0)).toEqual({ total: 0, bumped: false });
  });
});
