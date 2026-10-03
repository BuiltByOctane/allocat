import { describe, it, expect } from "vitest";
import { sanitizeAmountInput } from "./amountInput";

describe("sanitizeAmountInput", () => {
  it.each([
    ["450", "450"],
    ["12.", "12."],
    ["12.5", "12.5"],
    ["12.567", "12.56"],
    ["1.2.3", "1.23"],
    ["1,5", "1.5"],
    ["₹ 1 200", "1200"],
    ["-50", "50"],
    ["abc", ""],
    [".5", ".5"],
    ["123456789012", "1234567890"],
  ])("%s → %s", (input, expected) => {
    expect(sanitizeAmountInput(input)).toBe(expected);
  });
});
