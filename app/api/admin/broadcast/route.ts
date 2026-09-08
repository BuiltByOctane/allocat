import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { broadcast, countRecipients, SEGMENTS, type Segment } from "@/lib/server/push-broadcast";
import { notifyUser } from "@/lib/server/push-notify";
import { isFcmConfigured, sendToTokens, tokensForUser } from "@/lib/server/fcm";

// A fan-out over every subscription can outlast the default serverless budget.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const VALID = new Set<string>(SEGMENTS.map((s) => s.id));

/** GET ?segment=all → how many devices that segment reaches right now. */
export async function GET(req: Request) {
  await requireAdmin();
  const segment = new URL(req.url).searchParams.get("segment") ?? "all";
  if (!VALID.has(segment)) {
    return NextResponse.json({ error: "Unknown segment" }, { status: 400 });
  }
  const reach = await countRecipients(segment as Segment);
  return NextResponse.json({ recipients: reach.total, web: reach.web, android: reach.android });
}

/**
 * POST — send a campaign.
 *
 * `test: true` sends only to the calling admin's own devices and records
 * nothing; the UI requires a test before it enables the real send.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();

  let payload: {
    segment?: string;
    title?: string;
    body?: string;
    url?: string;
    test?: boolean;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = (payload.title ?? "").trim();
  const body = (payload.body ?? "").trim();
  const url = (payload.url ?? "").trim() || undefined;
  const segment = payload.segment ?? "all";

  if (!title || !body) {
    return NextResponse.json({ error: "Title and body are required." }, { status: 400 });
  }
  if (title.length > 80 || body.length > 300) {
    return NextResponse.json({ error: "Title ≤80 and body ≤300 characters." }, { status: 400 });
  }
  if (!VALID.has(segment)) {
    return NextResponse.json({ error: "Unknown segment" }, { status: 400 });
  }

  const notification = { title, body, url, tag: "allocat-broadcast" };

  if (payload.test) {
    // Report what actually happened. notifyUser fails silently by design (a
    // missing VAPID key must never break a budget save), so assuming success
    // here would tell the admin "sent" when nothing left the building.
    const web = await notifyUser(admin.id, notification);

    // The admin's own phone is reached over FCM, not web push — testing only
    // the web leg would keep saying "0 devices" for someone holding the app.
    let android = { tokens: 0, sent: 0, failed: 0, pruned: 0 };
    if (isFcmConfigured()) {
      try {
        android = await sendToTokens(await tokensForUser(admin.id), notification);
      } catch (err) {
        console.warn("[broadcast] test FCM leg failed:", err);
      }
    }

    return NextResponse.json({
      test: true,
      sent: web.sent + android.sent,
      subscriptions: web.subscriptions + android.tokens,
      skipped: web.subscriptions + android.tokens === 0 ? "no_subscriptions" : web.skipped,
      web: { sent: web.sent, subscriptions: web.subscriptions, skipped: web.skipped },
      android: { sent: android.sent, tokens: android.tokens },
    });
  }

  try {
    const result = await broadcast(segment as Segment, notification, admin.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Broadcast failed" },
      { status: 500 },
    );
  }
}
