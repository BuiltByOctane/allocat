import { describe, it, expect } from "vitest";
import { normalizeMerchant, matchMerchantRule, txnDedupeKey } from "./match";
import type { MerchantRule } from "./match";

describe("normalizeMerchant", () => {
  it("lowercases and trims", () => {
    expect(normalizeMerchant("  ZOMATO  ")).toBe("zomato");
  });
  it("strips a UPI handle domain", () => {
    expect(normalizeMerchant("amazon@ybl")).toBe("amazon");
  });
  it("collapses internal whitespace and drops trailing punctuation", () => {
    expect(normalizeMerchant("AMAZON   PAY.")).toBe("amazon pay");
  });
});

describe("matchMerchantRule", () => {
  const rules: MerchantRule[] = [
    { id: "r1", match_type: "exact", pattern: "zomato", budget_item_id: "i1", category_id: "c1", auto_apply: true },
    { id: "r2", match_type: "contains", pattern: "amazon", budget_item_id: "i2", category_id: "c2", auto_apply: true },
    { id: "r3", match_type: "regex", pattern: "^uber( eats)?$", budget_item_id: "i3", category_id: "c3", auto_apply: false },
  ];

  it("matches an exact rule", () => {
    expect(matchMerchantRule("ZOMATO", rules)?.id).toBe("r1");
  });
  it("matches a contains rule against a longer merchant string", () => {
    expect(matchMerchantRule("amazon@ybl", rules)?.id).toBe("r2");
  });
  it("matches a regex rule", () => {
    expect(matchMerchantRule("Uber Eats", rules)?.id).toBe("r3");
  });
  it("returns null when nothing matches", () => {
    expect(matchMerchantRule("flipkart", rules)).toBeNull();
  });
  it("prefers an exact match over a contains match", () => {
    const r: MerchantRule[] = [
      { id: "broad", match_type: "contains", pattern: "pay", budget_item_id: "i", category_id: "c", auto_apply: true },
      { id: "exact", match_type: "exact", pattern: "amazon pay", budget_item_id: "i", category_id: "c", auto_apply: true },
    ];
    expect(matchMerchantRule("Amazon Pay", r)?.id).toBe("exact");
  });
});

describe("txnDedupeKey", () => {
  it("is stable for the same SMS delivered twice", () => {
    const a = txnDedupeKey({ sender: "HDFCBK", raw: "Rs.500 debited to X ref 1" });
    const b = txnDedupeKey({ sender: "HDFCBK", raw: "Rs.500 debited to X ref 1" });
    expect(a).toBe(b);
  });
  it("differs for distinct transactions (different ref) ", () => {
    const a = txnDedupeKey({ sender: "HDFCBK", raw: "Rs.500 debited to X ref 1" });
    const b = txnDedupeKey({ sender: "HDFCBK", raw: "Rs.500 debited to X ref 2" });
    expect(a).not.toBe(b);
  });
});
