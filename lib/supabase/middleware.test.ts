import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { isProtectedPath, PROTECTED_PREFIXES, skipsAuth } from "./middleware";

/**
 * `updateSession` costs a Supabase Auth round trip on every matched request.
 * Server actions and route handlers authenticate themselves (and can refresh
 * the cookie, unlike an RSC render), so paying it there was pure duplication —
 * a 40-item sync drain used to make 40 extra auth calls.
 */
function req(pathname: string, headers: Record<string, string> = {}) {
  return {
    nextUrl: { pathname },
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as NextRequest;
}

describe("skipsAuth", () => {
  it("skips server action POSTs (they authenticate themselves)", () => {
    expect(skipsAuth(req("/dashboard", { "next-action": "abc123" }))).toBe(true);
  });

  it("skips route handlers", () => {
    expect(skipsAuth(req("/api/app-config"))).toBe(true);
    expect(skipsAuth(req("/api/admin/cron/play-sync"))).toBe(true);
  });

  it("keeps the auth check for document / RSC navigations", () => {
    expect(skipsAuth(req("/dashboard"))).toBe(false);
    expect(skipsAuth(req("/auth/login"))).toBe(false);
    expect(skipsAuth(req("/admin/users"))).toBe(false);
  });

  it("does not confuse a path merely starting with 'api'", () => {
    expect(skipsAuth(req("/apiary"))).toBe(false);
  });
});

describe("isProtectedPath", () => {
  it("protects every top-level route under app/(app)", () => {
    const appGroup = path.join(process.cwd(), "app", "(app)");
    const routes = readdirSync(appGroup, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `/${entry.name}`);

    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(isProtectedPath(route), `${route} missing from PROTECTED_PREFIXES`).toBe(true);
    }
  });

  it("matches nested paths", () => {
    expect(isProtectedPath("/profile")).toBe(true);
    expect(isProtectedPath("/sms/rules")).toBe(true);
    expect(isProtectedPath("/admin/users/123")).toBe(true);
  });

  it("leaves public routes alone", () => {
    for (const p of ["/", "/auth/login", "/legal/privacy-policy", "/guides/iphone-sms", "/~offline"]) {
      expect(isProtectedPath(p)).toBe(false);
    }
  });

  it("does not match on a bare prefix", () => {
    expect(isProtectedPath("/smsguide")).toBe(false);
    expect(PROTECTED_PREFIXES).toContain("/sms");
  });
});
