/**
 * Validation for the iOS waitlist signup (app/api/waitlist).
 *
 * Kept free of Next/Supabase imports so it can be unit-tested directly.
 */

export const PREFERENCES = ["native", "web", "either"] as const;
export type Preference = (typeof PREFERENCES)[number];

const SOURCES = new Set(["cta", "home_section"]);
const PLATFORMS = new Set(["ios", "android", "desktop"]);

// Deliberately loose: one @, a dot in the domain, no spaces. Real validation is
// the launch email bouncing — a strict regex only rejects valid addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type WaitlistInput =
  | { ok: true; spam: true }
  | {
      ok: true;
      spam: false;
      row: { email: string; preference: Preference; source: string | null; platform: string | null };
    }
  | { ok: false; error: "invalid_email" | "invalid_preference" };

function pick(v: unknown, allowed: Set<string>): string | null {
  return typeof v === "string" && allowed.has(v) ? v : null;
}

export function parseWaitlistInput(payload: Record<string, unknown>): WaitlistInput {
  // Honeypot: a hidden field real visitors never fill. Pretend success.
  if (typeof payload.website === "string" && payload.website.trim()) {
    return { ok: true, spam: true };
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, error: "invalid_email" };
  }

  const preference = payload.preference;
  if (typeof preference !== "string" || !(PREFERENCES as readonly string[]).includes(preference)) {
    return { ok: false, error: "invalid_preference" };
  }

  return {
    ok: true,
    spam: false,
    row: {
      email,
      preference: preference as Preference,
      source: pick(payload.source, SOURCES),
      platform: pick(payload.platform, PLATFORMS),
    },
  };
}
