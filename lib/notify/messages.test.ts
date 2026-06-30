import { describe, it, expect } from "vitest";
import {
  tierForCount,
  poolIndex,
  pickOverspendMessage,
  type OverspendCtx,
} from "./messages";

const base: OverspendCtx = {
  itemName: "Groceries",
  tier: 1,
  count: 1,
  over: 250,
  currency: "INR",
  firstOverspend: true,
  seed: "item-abc:1",
};

describe("tierForCount", () => {
  it("maps counts to tiers and caps at 3", () => {
    expect(tierForCount(1)).toBe(1);
    expect(tierForCount(2)).toBe(2);
    expect(tierForCount(3)).toBe(3);
    expect(tierForCount(4)).toBe(3);
    expect(tierForCount(99)).toBe(3);
  });
  it("treats non-positive counts as tier 1", () => {
    expect(tierForCount(0)).toBe(1);
  });
});

describe("poolIndex", () => {
  it("is deterministic for the same seed", () => {
    expect(poolIndex("item-abc:1", 4)).toBe(poolIndex("item-abc:1", 4));
  });
  it("stays within bounds", () => {
    for (let i = 0; i < 20; i++) {
      const idx = poolIndex(`seed-${i}`, 3);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(3);
    }
  });
});

describe("pickOverspendMessage", () => {
  it("tier 1 mentions other allocations or savings", () => {
    const m = pickOverspendMessage({ ...base, tier: 1, count: 1, firstOverspend: true });
    expect(m.body.toLowerCase()).toMatch(/allocation|saving/);
  });
  it("includes the item name and over amount", () => {
    const m = pickOverspendMessage({ ...base, over: 250, itemName: "Groceries" });
    expect(m.body).toContain("Groceries");
    expect(m.body).toMatch(/250/);
  });
  it("varies across tiers", () => {
    const t1 = pickOverspendMessage({ ...base, tier: 1, count: 1, seed: "x:1" });
    const t3 = pickOverspendMessage({ ...base, tier: 3, count: 3, seed: "x:3" });
    expect(t1.body).not.toBe(t3.body);
  });
  it("is deterministic for a fixed seed", () => {
    const a = pickOverspendMessage({ ...base, seed: "fixed:2", tier: 2, count: 2 });
    const b = pickOverspendMessage({ ...base, seed: "fixed:2", tier: 2, count: 2 });
    expect(a).toEqual(b);
  });
  it("contains no em-dash", () => {
    for (const tier of [1, 2, 3] as const) {
      for (let c = 0; c < 8; c++) {
        const m = pickOverspendMessage({ ...base, tier, count: tier, seed: `s:${tier}:${c}` });
        expect(m.title).not.toContain("—");
        expect(m.body).not.toContain("—");
      }
    }
  });
});
