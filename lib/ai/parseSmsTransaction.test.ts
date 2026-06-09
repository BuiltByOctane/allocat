import { describe, it, expect } from "vitest";
import { parseTransactionSms } from "./parseSmsTransaction";

describe("parseTransactionSms — amount + currency", () => {
  it("extracts amount, INR currency and debit direction from an HDFC debit SMS", () => {
    const sms =
      "Rs.1,500.00 debited from a/c **1234 on 02-06-26 to VPA amazon@ybl. Avl Bal Rs.10,000.00";
    const r = parseTransactionSms(sms, "HDFCBK");
    expect(r.amount).toBe(1500);
    expect(r.currency).toBe("INR");
    expect(r.direction).toBe("debit");
  });

  it("extracts amount from 'debited by <num>' with no currency token (SBI UPI)", () => {
    const sms =
      "Dear UPI user A/C X1234 debited by 199.0 on date 02Jun26 trf to ZOMATO refno 123. -SBI";
    const r = parseTransactionSms(sms, "SBIUPI");
    expect(r.amount).toBe(199);
    expect(r.direction).toBe("debit");
  });

  it("parses the real multi-line HDFC 'Sent Rs.X ... To NAME' debit format", () => {
    const sms =
      "Sent Rs.100.00\nFrom HDFC Bank A/C *8852\nTo ASHWIN K V\nOn 04/06/26\nRef 615592617475\nNot You?";
    const r = parseTransactionSms(sms, "AD-HDFCBK-S");
    expect(r.amount).toBe(100);
    expect(r.direction).toBe("debit");
    expect(r.merchant?.toUpperCase()).toContain("ASHWIN");
    expect(r.occurredAt).toBe("2026-06-04");
  });

  it("extracts amount from 'debited for Rs N' (ICICI)", () => {
    const sms =
      "ICICI Bank Acct XX829 debited for Rs 250.00 on 02-Jun-26 & SWIGGY credited. UPI:401234567890.";
    const r = parseTransactionSms(sms, "ICICIB");
    expect(r.amount).toBe(250);
  });
});

describe("parseTransactionSms — direction", () => {
  it("treats the account being debited as a debit even when a payee is credited", () => {
    const sms =
      "ICICI Bank Acct XX829 debited for Rs 250.00 on 02-Jun-26 & SWIGGY credited. UPI:401234567890.";
    const r = parseTransactionSms(sms, "ICICIB");
    expect(r.direction).toBe("debit");
  });

  it("detects a credit when money is credited to the account", () => {
    const sms =
      "Rs.2,000.00 credited to a/c **1234 on 02-06-26 by VPA john@oksbi. Avl Bal Rs.12,000.00";
    const r = parseTransactionSms(sms, "HDFCBK");
    expect(r.direction).toBe("credit");
    expect(r.amount).toBe(2000);
  });
});

describe("parseTransactionSms — merchant", () => {
  it("extracts a VPA payee handle's name (debit)", () => {
    const sms =
      "Rs.1,500.00 debited from a/c **1234 on 02-06-26 to VPA amazon@ybl. Avl Bal Rs.10,000.00";
    const r = parseTransactionSms(sms, "HDFCBK");
    expect(r.merchant?.toLowerCase()).toContain("amazon");
  });

  it("extracts a 'trf to <MERCHANT>' payee (SBI)", () => {
    const sms =
      "Dear UPI user A/C X1234 debited by 199.0 on date 02Jun26 trf to ZOMATO refno 123. -SBI";
    const r = parseTransactionSms(sms, "SBIUPI");
    expect(r.merchant?.toUpperCase()).toContain("ZOMATO");
  });

  it("extracts the '& <MERCHANT> credited' payee (ICICI)", () => {
    const sms =
      "ICICI Bank Acct XX829 debited for Rs 250.00 on 02-Jun-26 & SWIGGY credited. UPI:401234567890.";
    const r = parseTransactionSms(sms, "ICICIB");
    expect(r.merchant?.toUpperCase()).toContain("SWIGGY");
  });
});

describe("parseTransactionSms — non-transaction SMS", () => {
  it("returns low confidence and no amount for an OTP message", () => {
    const sms = "123456 is your OTP for login. Valid for 10 min. Do not share. -HDFC";
    const r = parseTransactionSms(sms, "HDFCBK");
    expect(r.amount).toBeNull();
    expect(r.confidence).toBeLessThan(0.5);
  });

  it("gives high confidence when amount + direction + merchant are all present", () => {
    const sms =
      "Rs.1,500.00 debited from a/c **1234 on 02-06-26 to VPA amazon@ybl. Avl Bal Rs.10,000.00";
    const r = parseTransactionSms(sms, "HDFCBK");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });
});

describe("parseTransactionSms — date", () => {
  it("parses a dd-mm-yy date into ISO occurredAt", () => {
    const sms =
      "Rs.1,500.00 debited from a/c **1234 on 02-06-26 to VPA amazon@ybl. Avl Bal Rs.10,000.00";
    const r = parseTransactionSms(sms, "HDFCBK");
    expect(r.occurredAt).toBe("2026-06-02");
  });
});

// Shapes that previously needed the (now-removed) LLM fallback. The on-device
// regex must carry these on its own at confidence >= 0.6.
describe("parseTransactionSms — on-device coverage (post-LLM-removal)", () => {
  it("reads a card spend 'spent ... at MERCHANT'", () => {
    const r = parseTransactionSms(
      "Rs.499 spent on your SBI Card at AMAZON on 01-Jun-26. Avl Lmt Rs.40,000",
    );
    expect(r.amount).toBe(499);
    expect(r.direction).toBe("debit");
    expect(r.merchant?.toUpperCase()).toContain("AMAZON");
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("reads an ATM withdrawal and ignores the trailing balance", () => {
    const r = parseTransactionSms(
      "INR 3,000 withdrawn from A/c no. XX789 on 02Jun26. Avl Bal INR 12,000.00",
    );
    expect(r.amount).toBe(3000);
    expect(r.direction).toBe("debit");
  });

  it("reads 'paid to MERCHANT via UPI'", () => {
    const r = parseTransactionSms(
      "Rs 89 paid to BIGBASKET via UPI on 04-06-26. Ref 998877. - Axis Bank",
    );
    expect(r.amount).toBe(89);
    expect(r.direction).toBe("debit");
    expect(r.merchant?.toUpperCase()).toContain("BIGBASKET");
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("never reads available balance as the amount (amount after keyword)", () => {
    const r = parseTransactionSms(
      "Spent Rs.200 at CAFE on 01-Jun-26. Avl Bal Rs.9,999.00",
    );
    expect(r.amount).toBe(200);
  });

  it("keeps low-information SMS below the manual-allocation threshold", () => {
    const r = parseTransactionSms("Your account was updated. Avl Bal Rs.100");
    expect(r.confidence).toBeLessThan(0.6);
  });

  it("reads the HDFC credit-card UPI spend ('made using your ... Card at <vpa>')", () => {
    const r = parseTransactionSms(
      "A transaction of Rs. 133.08 was made using your HDFC Bank Pixel Play Credit Card at zomato-order@ptybl via UPI 652606067939 on 09/06/26 at 20:07. Not you? Block your Card: https://1.hdfc.bank.in/HDFCBK/s/4JPep9Oj or SMS BLOCKPCC 7122 to 8433642286",
      "HDFCBK",
    );
    expect(r.amount).toBe(133.08);
    expect(r.currency).toBe("INR");
    // No debit keyword — direction comes from the card-spend phrasing.
    expect(r.direction).toBe("debit");
    // Merchant must be the payee VPA, not the trailing BLOCKPCC shortcode number.
    expect(r.merchant?.toLowerCase()).toContain("zomato");
    expect(r.merchant).not.toMatch(/^\d+$/);
    expect(r.occurredAt).toBe("2026-06-09");
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
  });
});
