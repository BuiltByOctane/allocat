import { describe, it, expect } from "vitest";
import {
  isAmountEdited,
  effectiveAmount,
  nextOriginalAmount,
  sameItemDelta,
} from "@/lib/sms/amountDelta";

describe("isAmountEdited", () => {
  it("is false when the edited value matches the current", () => {
    expect(isAmountEdited(100, 100)).toBe(false);
  });
  it("is false for missing / non-positive edits", () => {
    expect(isAmountEdited(100, undefined)).toBe(false);
    expect(isAmountEdited(100, null)).toBe(false);
    expect(isAmountEdited(100, 0)).toBe(false);
    expect(isAmountEdited(100, -5)).toBe(false);
  });
  it("is true for a different positive value", () => {
    expect(isAmountEdited(100, 120)).toBe(true);
    expect(isAmountEdited(null, 120)).toBe(true);
  });
});

describe("effectiveAmount", () => {
  it("returns the edited value when it is a real change", () => {
    expect(effectiveAmount(100, 120)).toBe(120);
  });
  it("returns the current value when there is no edit", () => {
    expect(effectiveAmount(100, undefined)).toBe(100);
    expect(effectiveAmount(100, 100)).toBe(100);
  });
});

describe("nextOriginalAmount", () => {
  it("stashes the pre-edit amount the FIRST time it changes", () => {
    expect(nextOriginalAmount(100, null, 120)).toBe(100);
  });
  it("keeps the already-stored original on subsequent edits", () => {
    expect(nextOriginalAmount(120, 100, 150)).toBe(100);
  });
  it("leaves original untouched when nothing changed", () => {
    expect(nextOriginalAmount(100, null, undefined)).toBe(null);
    expect(nextOriginalAmount(120, 100, undefined)).toBe(100);
  });
});

describe("sameItemDelta", () => {
  it("is positive when the amount increases", () => {
    expect(sameItemDelta(100, 150)).toBe(50);
  });
  it("is negative (a refund) when the amount decreases", () => {
    expect(sameItemDelta(100, 60)).toBe(-40);
  });
  it("is zero when unchanged", () => {
    expect(sameItemDelta(100, 100)).toBe(0);
  });
});
