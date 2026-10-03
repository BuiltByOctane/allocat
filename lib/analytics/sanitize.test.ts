import { describe, expect, it } from "vitest";
import { isUntrackedPath, normalizePath, sanitizeProps } from "./sanitize";

describe("sanitizeProps", () => {
  it("keeps booleans and short lowercase tokens", () => {
    expect(sanitizeProps({ source: "sms", matched: true, accent: "net_worth" })).toEqual({
      source: "sms",
      matched: true,
      accent: "net_worth",
    });
  });

  it("drops numbers, free text and objects", () => {
    expect(
      sanitizeProps({
        amount: 1250,
        merchant: "Swiggy Instamart",
        note: "dinner with friends",
        nested: { a: 1 },
        empty: "",
        upper: "INR",
        nil: null,
      })
    ).toEqual({});
  });

  it("drops long tokens", () => {
    expect(sanitizeProps({ v: "a".repeat(33) })).toEqual({});
  });

  it("handles undefined", () => {
    expect(sanitizeProps(undefined)).toEqual({});
  });
});

describe("normalizePath", () => {
  it("replaces uuid, temp and numeric segments", () => {
    expect(normalizePath("/goals/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d")).toBe("/goals/:id");
    expect(normalizePath("/debt/temp_abc123")).toBe("/debt/:id");
    expect(normalizePath("/reports/2026/10")).toBe("/reports/:id/:id");
  });

  it("leaves static routes and strips query", () => {
    expect(normalizePath("/dashboard")).toBe("/dashboard");
    expect(normalizePath("/budget?month=3")).toBe("/budget");
    expect(normalizePath("")).toBe("/");
  });
});

describe("isUntrackedPath", () => {
  it("matches admin only", () => {
    expect(isUntrackedPath("/admin")).toBe(true);
    expect(isUntrackedPath("/admin/users")).toBe(true);
    expect(isUntrackedPath("/administrator")).toBe(false);
    expect(isUntrackedPath("/dashboard")).toBe(false);
  });
});
