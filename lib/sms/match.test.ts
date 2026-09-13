import { describe, it, expect } from "vitest";
import { normalizeMerchant, matchMerchantRule, txnDedupeKey, smsTemplateKey } from "./match";
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

  it("passes durable template identity through untouched (matching is pattern-only)", () => {
    const durable: MerchantRule[] = [
      {
        id: "r-durable",
        match_type: "exact",
        pattern: "zomato",
        template_id: "tpl-1",
        template_item_id: "ti-dining",
        budget_item_id: null,
        category_id: null,
        auto_apply: true,
      },
    ];
    const hit = matchMerchantRule("ZOMATO", durable);
    expect(hit?.template_id).toBe("tpl-1");
    expect(hit?.template_item_id).toBe("ti-dining");
    expect(hit?.budget_item_id).toBeNull();
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

describe("smsTemplateKey", () => {
  it("collapses the same credit template with different amounts/dates/refs to one key", () => {
    const a = smsTemplateKey({
      sender: "HDFCBK",
      raw: "Rs.1,250.00 credited to a/c XX1234 on 05-06-26 ref 998877. Avl bal Rs.5,000",
    });
    const b = smsTemplateKey({
      sender: "HDFCBK",
      raw: "Rs.42.50 credited to a/c XX9999 on 18-12-25 ref 112233. Avl bal Rs.812",
    });
    expect(a).toBe(b);
  });

  it("collapses one bank template across the three shapes a UPI payer arrives in", () => {
    // Kerala Grameena Bank credit alerts: the payer is a name glued to digits, a
    // name plus digits, or a bare UPI handle. Masking only the digit RUNS left
    // three distinct skeletons, so reporting one instance blocked none of them.
    const keys = [
      "Dear Customer, Account XXXX693 is credited with INR 71 on 11-09-2026 19:51:59 from nandanapnair159. UPI Ref. no. 625419410968-Kerala Grameena Bank",
      "Dear Customer, Account XXXX693 is credited with INR 125 on 12-09-2026 19:38:47 from nandanapnair 159. UPI Ref. no. 625519683688-Kerala Grameena Bank",
      "Dear Customer, Account XXXX693 is credited with INR 106 on 12-09-2026 19:37:01 from 6238271344@mbkn. UPI Ref. no. 625519679183-Kerala Grameena Bank",
    ].map((raw) => smsTemplateKey({ sender: "KERALAGB", raw }));

    expect(new Set(keys).size).toBe(1);
  });

  it("matches the Java port byte-for-byte (SmsSignature.java fixtures)", () => {
    // The closed-app receiver computes this key in Java and matches it against
    // the blocklist pushed from here, so the two implementations must agree
    // exactly. Values below were produced by SmsSignature.templateKey().
    const cases: Array<[string, string]> = [
      [
        "Dear Customer, Account XXXX693 is credited with INR 71 on 11-09-2026 19:51:59 from nandanapnair159. UPI Ref. no. 625419410968-Kerala Grameena Bank",
        "1e54cc4bed4280",
      ],
      [
        "ICICI Bank Acct XX829 debited for Rs 250.00 on 02-Jun-26 & SWIGGY credited. UPI:401234567890.",
        "0d30aa7e009a07",
      ],
      [
        "A transaction of Rs.1500 was made using your HDFC Credit Card at AMAZON",
        "00774afdb01c41",
      ],
    ];
    for (const [raw, key] of cases) {
      expect(smsTemplateKey({ sender: "KERALAGB", raw })).toBe(key);
    }
  });

  it("gives a debit and a credit of the same bank/format different keys", () => {
    const credit = smsTemplateKey({
      sender: "HDFCBK",
      raw: "Rs.1,250.00 credited to a/c XX1234 on 05-06-26 ref 998877",
    });
    const debit = smsTemplateKey({
      sender: "HDFCBK",
      raw: "Rs.1,250.00 debited to a/c XX1234 on 05-06-26 ref 998877",
    });
    expect(credit).not.toBe(debit);
  });
});
