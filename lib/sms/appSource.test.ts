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
