import { describe, it, expect } from "vitest";
import { safeNextPath } from "./safeNext";

describe("safeNextPath", () => {
  it("returns the fallback for empty input", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
    expect(safeNextPath(undefined)).toBe("/dashboard");
  });

  it("accepts same-origin absolute paths", () => {
    expect(safeNextPath("/onboarding")).toBe("/onboarding");
    expect(safeNextPath("/sms?txn=abc")).toBe("/sms?txn=abc");
  });

  it("rejects userinfo / host smuggling", () => {
    // `${origin}@evil.com` → https://allocat.xyz@evil.com → host evil.com
    expect(safeNextPath("@evil.com")).toBe("/dashboard");
    expect(safeNextPath("evil.com")).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
  });

  it("rejects protocol-relative and backslash paths", () => {
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
  });

  it("honours a custom fallback", () => {
    expect(safeNextPath("@x", "/")).toBe("/");
  });
});
