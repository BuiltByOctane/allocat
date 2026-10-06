import { describe, it, expect } from "vitest";
import { prepareShortcutSms, MAX_SHORTCUT_TEXT } from "./prepare";
import { txnDedupeKey, smsTemplateKey } from "@/lib/sms/match";

const DEBIT = "Rs.240.00 debited from A/c XX1234 to SWIGGY on 06-10-26. UPI Ref 123456789";

describe("prepareShortcutSms", () => {
  it("extracts a debit", () => {
    const r = prepareShortcutSms(DEBIT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.txn.amount).toBe(240);
    expect(r.txn.currency).toBe("INR");
    expect(r.txn.direction).toBe("debit");
    expect(r.txn.merchantRaw).toBeTruthy();
  });

  it("hashes like the on-device path with no sender, and carries no raw text", () => {
    const r = prepareShortcutSms(`  ${DEBIT}\n`);
    if (!r.ok) throw new Error("expected ok");
    expect(r.txn.dedupeKey).toBe(txnDedupeKey({ sender: null, raw: DEBIT }));
    expect(r.txn.templateKey).toBe(smsTemplateKey({ sender: null, raw: DEBIT }));
    expect(JSON.stringify(r.txn)).not.toContain("UPI Ref");
  });

  it("same SMS twice → same dedupe key", () => {
    const a = prepareShortcutSms(DEBIT);
    const b = prepareShortcutSms(DEBIT);
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.txn.dedupeKey).toBe(b.txn.dedupeKey);
  });

  it("skips empty, non-string and oversized input", () => {
    expect(prepareShortcutSms("")).toEqual({ ok: false, reason: "empty" });
    expect(prepareShortcutSms(undefined)).toEqual({ ok: false, reason: "empty" });
    expect(prepareShortcutSms({ text: DEBIT })).toEqual({ ok: false, reason: "empty" });
    expect(prepareShortcutSms("x".repeat(MAX_SHORTCUT_TEXT + 1))).toEqual({
      ok: false,
      reason: "too-long",
    });
  });

  it("skips OTP, credits and chat noise", () => {
    expect(
      prepareShortcutSms("123456 is your OTP to confirm debit of Rs.500 at AMAZON").ok,
    ).toBe(false);
    expect(prepareShortcutSms("Rs.5000 credited to your A/c XX1234 from SALARY")).toEqual({
      ok: false,
      reason: "credit",
    });
    expect(prepareShortcutSms("hey, the payment got debited yet?")).toEqual({
      ok: false,
      reason: "no-amount",
    });
  });
});
