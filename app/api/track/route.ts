import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { rateLimit } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Anonymous funnel beacon for the landing site (grow.allocat.xyz).
 *
 * Privacy is the whole design constraint: we store an event name, a coarse
 * platform, the path, and the referrer's HOSTNAME. No IP, no user agent, no
 * cookie, no id, nothing joinable back to a person. The client IP is used only
 * as an in-memory rate-limit key and is never written anywhere.
 *
 * Accepts `text/plain` so `navigator.sendBeacon` stays a CORS-simple request
 * (a preflight would be dropped on unload and the event lost). Always answers
 * 204 and never echoes input — there is nothing here worth probing.
 */

const ALLOWED_EVENTS = new Set([
  "page_view",
  "cta_play_click",
  "cta_login_click",
  "cta_kofi_click",
  "pwa_ios_help",
]);

const ALLOWED_ORIGIN = "https://grow.allocat.xyz";
const MAX_BODY = 1024;

// Generous: one visitor legitimately fires a page_view plus a few clicks.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/** Referrers are reduced to a hostname so no query string can smuggle in an id. */
function hostOnly(v: unknown): string | null {
  const raw = clip(v, 500);
  if (!raw) return null;
  try {
    return new URL(raw).hostname.slice(0, 120);
  } catch {
    return null;
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const noContent = () => new NextResponse(null, { status: 204, headers: CORS });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!rateLimit(`track:${ip}`, RATE_LIMIT, RATE_WINDOW_MS).ok) return noContent();

  let payload: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return noContent();
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return noContent();
  }

  const event = clip(payload.event, 40);
  if (!event || !ALLOWED_EVENTS.has(event)) return noContent();

  try {
    // supabase-js returns errors rather than throwing, so check `error` too —
    // otherwise a missing table or a bad policy fails completely silently, which
    // for an analytics beacon means never noticing you have no data.
    const { error } = await createServiceClient().from("landing_events").insert({
      event,
      platform: clip(payload.platform, 20),
      path: clip(payload.path, 200),
      referrer: hostOnly(payload.referrer),
    });
    if (error) console.warn("[track] insert failed:", error.message);
  } catch (err) {
    // A dropped analytics event is never worth an error response.
    console.warn("[track] insert threw:", err);
  }

  return noContent();
}
