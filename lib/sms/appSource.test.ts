import { describe, it, expect } from "vitest";
import { detectAppSource, appSourceDisplay } from "./appSource";

describe("detectAppSource", () => {
  it("maps Google Pay sender ids to gpay", () => {
    expect(detectAppSource("AD-GPAY-S")).toBe("gpay");
    expect(detectAppSource("VM-GOOGLEPAY")).toBe("gpay");
    expect(detectAppSource("gpay")).toBe("gpay");
  });

  it("maps PhonePe sender ids to phonepe", () => {
    expect(detectAppSource("VM-PHONEPE")).toBe("phonepe");
    expect(detectAppSource("AX-PHONPE")).toBe("phonepe");
    expect(detectAppSource("JD-PhonePy")).toBe("phonepe");
  });

  it("maps Paytm sender ids to paytm", () => {
    expect(detectAppSource("JK-PAYTMB")).toBe("paytm");
    expect(detectAppSource("paytm")).toBe("paytm");
  });

  it("maps Amazon sender ids to amazonpay", () => {
    expect(detectAppSource("AD-AMAZON")).toBe("amazonpay");
    expect(detectAppSource("VK-AmazonPay")).toBe("amazonpay");
  });

  it("maps CRED sender ids to cred", () => {
    expect(detectAppSource("AX-CRED")).toBe("cred");
  });

  it("is case-insensitive", () => {
    expect(detectAppSource("ad-gpay")).toBe("gpay");
    expect(detectAppSource("AD-GPAY")).toBe("gpay");
  });

  it("returns null for unknown / bank senders and empty input", () => {
    expect(detectAppSource("AD-HDFCBK")).toBeNull();
    expect(detectAppSource("VM-SBIINB")).toBeNull();
    expect(detectAppSource("")).toBeNull();
    expect(detectAppSource(null)).toBeNull();
    expect(detectAppSource(undefined)).toBeNull();
  });

  it("detects an explicit app mention in the body (bank sender)", () => {
    expect(
      detectAppSource("AD-HDFCBK", "Rs.150 debited via Google Pay. UPI Ref 123"),
    ).toBe("gpay");
    expect(
      detectAppSource("VK-ICICIB", "Paid using PhonePe to Cafe. Ref 99"),
    ).toBe("phonepe");
  });

  it("detects the app from a counterparty UPI VPA handle in the body", () => {
    expect(
      detectAppSource("AD-HDFCBK", "Rs 200 sent to cafe@okhdfcbank UPI:123"),
    ).toBe("gpay");
    expect(
      detectAppSource("VM-AXISBK", "Paid Rs 50 to shop@ybl on 01-Jul"),
    ).toBe("phonepe");
    expect(
      detectAppSource("AD-SBIINB", "Debited Rs 75 to vendor@paytm Ref 7"),
    ).toBe("paytm");
  });

  it("does NOT tag bare merchant 'Amazon' in the body as amazonpay", () => {
    expect(
      detectAppSource("AD-HDFCBK", "Rs 499 spent at Amazon. UPI Ref 321"),
    ).toBeNull();
    expect(
      detectAppSource("AD-HDFCBK", "Rs 499 paid via Amazon Pay balance"),
    ).toBe("amazonpay");
  });
});

describe("appSourceDisplay", () => {
  it("resolves known keys to display metadata", () => {
    expect(appSourceDisplay("gpay")?.label).toBe("GPay");
    expect(appSourceDisplay("phonepe")?.label).toBe("PhonePe");
  });

  it("returns null for null / unknown source", () => {
    expect(appSourceDisplay(null)).toBeNull();
    expect(appSourceDisplay("unknown")).toBeNull();
  });
});
