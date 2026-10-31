import { describe, expect, it } from "vitest";
import { hrefForPath, PROFILE_OWNED } from "./navItems";

describe("hrefForPath", () => {
  it("resolves primary tabs and their sub-routes", () => {
    expect(hrefForPath("/dashboard")).toBe("/dashboard");
    expect(hrefForPath("/budget")).toBe("/budget");
    expect(hrefForPath("/profile/edit")).toBe("/profile");
  });

  it.each(PROFILE_OWNED)("keeps Profile active on %s", (route) => {
    expect(hrefForPath(route)).toBe("/profile");
    expect(hrefForPath(`${route}/x`)).toBe("/profile");
  });

  it("covers every page reached from Profile", () => {
    for (const r of ["/whats-new", "/support", "/activity", "/sms", "/transactions", "/reports", "/notifications"]) {
      expect(hrefForPath(r)).toBe("/profile");
    }
  });

  it("does not match a route that merely shares a prefix", () => {
    expect(hrefForPath("/smsx")).toBe("/dashboard");
  });

  it("leaves dashboard-reached pages on Home", () => {
    expect(hrefForPath("/goals")).toBe("/dashboard");
  });
});
