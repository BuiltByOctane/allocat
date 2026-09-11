import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { skipsAuth } from "./middleware";

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
