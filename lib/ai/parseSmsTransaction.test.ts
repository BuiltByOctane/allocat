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
