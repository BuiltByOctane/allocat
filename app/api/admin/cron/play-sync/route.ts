import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncPlayInstalls } from "@/lib/play/installs";

// The GCS fetch + parse for a couple of months takes a few seconds.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Constant-time compare — avoids leaking the secret via response timing. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Nightly Play install sync.
 *
 * Authenticated by CRON_SECRET, NOT requireAdmin — a scheduler has no session
 * cookie. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Returns 503
 * when the secret is unset so an unconfigured deploy exposes nothing.
 *
 * The manual "Sync now" button on /admin/growth calls syncPlayInstalls through
 * an admin-guarded server action instead, so it never needs this secret.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncPlayInstalls();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[play-sync]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync failed" },
      { status: 500 },
    );
  }
}
