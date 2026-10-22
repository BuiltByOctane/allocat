import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { rateLimit } from "@/lib/server/rateLimit";
import { parseWaitlistInput } from "@/lib/server/waitlist";

export const dynamic = "force-dynamic";

/**
 * iOS auto-tracking waitlist signup from the landing site (grow.allocat.xyz).
 *
 * Stores email + native/web preference in `ios_waitlist`. The client IP is used
 * only as an in-memory rate-limit key and is never written anywhere.
 *
 * Accepts `text/plain` JSON so the request stays CORS-simple (no preflight),
 * matching app/api/track. A repeat signup updates the stored preference and
 * answers exactly like a new one, so the form never reveals whether an email is
 * already on the list.
 */

const ALLOWED_ORIGIN = "https://grow.allocat.xyz";
const MAX_BODY = 1024;

// A person signs up once, maybe fixes a typo. Anything beyond is a script.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60_000;

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!rateLimit(`waitlist:${ip}`, RATE_LIMIT, RATE_WINDOW_MS).ok) {
    return json({ ok: false, error: "rate_limited" }, 429);
  }

  let payload: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ ok: false, error: "invalid_email" }, 400);
    payload = JSON.parse(text) as Record<string, unknown>;
    if (!payload || typeof payload !== "object") throw new Error("not an object");
  } catch {
    return json({ ok: false, error: "invalid_email" }, 400);
  }

  const input = parseWaitlistInput(payload);
  if (!input.ok) return json({ ok: false, error: input.error }, 400);
  if (input.spam) return json({ ok: true });

  try {
    const { error } = await createServiceClient()
      .from("ios_waitlist")
      .upsert({ ...input.row, updated_at: new Date().toISOString() }, { onConflict: "email" });
    if (error) {
      console.warn("[waitlist] upsert failed:", error.message);
      return json({ ok: false }, 500);
    }
  } catch (err) {
    console.warn("[waitlist] upsert threw:", err);
    return json({ ok: false }, 500);
  }

  return json({ ok: true });
}
