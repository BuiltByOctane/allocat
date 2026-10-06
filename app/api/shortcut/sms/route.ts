import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { rateLimit } from "@/lib/server/rateLimit";
import { getServerFlags } from "@/lib/config/serverFlags";
import { parseShortcutBearer } from "@/lib/shortcut/key";
import { prepareShortcutSms } from "@/lib/shortcut/prepare";
import {
  pendingReply,
  pendingPush,
  reachedIosDevice,
  CONNECTED_REPLY,
  NEEDS_KEY_REPLY,
  INVALID_KEY_REPLY,
  type ShortcutReply,
} from "@/lib/shortcut/reply";
import { resolveShortcutKey, markShortcutCapture } from "@/lib/server/shortcut-keys";
import { ingestShortcutTxn } from "@/lib/server/shortcut-ingest";
import { notifyUser } from "@/lib/server/push-notify";

export const dynamic = "force-dynamic";

/**
 * iPhone SMS capture. A Shortcuts "Message" automation POSTs the text of a
 * matching bank SMS here:
 *
 *   Authorization: Bearer alc_…        (the user's shortcut key)
 *   { "text": "<the SMS>", "v": 1 }
 *
 * The key is the ONLY identity — no cookie, and a user id in the body is never
 * read. The text is parsed in memory with the same parser as Android and
 * discarded; only the extracted fields and one-way hashes are stored.
 *
 * Every answer is HTTP 200 with `{ status, notify? }`. The shortcut shows
 * `notify` when present and stays silent otherwise; a non-2xx answer would
 * surface as a generic Shortcuts error the user can't act on, while a 200 with
 * a message ("paste your key", "key no longer works") tells them what to fix.
 */

/** Generous for real use: a burst of SMS after a phone comes back online. */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const MAX_BODY = 8 * 1024;

function reply(r: ShortcutReply) {
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}

/** Accepts the JSON body the shortcut sends; tolerates plain text as a fallback. */
function readText(body: string): unknown {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "text" in parsed) {
      return (parsed as { text: unknown }).text;
    }
    return typeof parsed === "string" ? parsed : "";
  } catch {
    return body;
  }
}

export async function POST(req: Request) {
  const bearer = parseShortcutBearer(req.headers.get("authorization"));
  if (bearer.kind === "missing" || bearer.kind === "placeholder") {
    return reply(NEEDS_KEY_REPLY);
  }
  if (bearer.kind === "malformed") return reply(INVALID_KEY_REPLY);

  // Cheap guard before any DB work; keys are random, so a slice is a fine bucket.
  if (!rateLimit(`sck:${bearer.key.slice(0, 24)}`, RATE_LIMIT, RATE_WINDOW_MS).ok) {
    return reply({ status: "rate-limited" });
  }

  const flags = await getServerFlags();
  if (!flags.sms_enabled) return reply({ status: "disabled" });

  try {
    const owner = await resolveShortcutKey(bearer.key);
    if (!owner) return reply(INVALID_KEY_REPLY);

    const raw = await req.text();
    if (raw.length > MAX_BODY) return reply({ status: "skipped" });
    const text = readText(raw);

    // A manual ▶ run from the Shortcuts app has no message: that is the setup
    // "test" step, and the key just proved valid.
    if (typeof text !== "string" || !text.trim()) return reply(CONNECTED_REPLY);

    const prepared = prepareShortcutSms(text);
    if (!prepared.ok) return reply({ status: "skipped" });

    const result = await ingestShortcutTxn(createServiceClient(), owner.userId, prepared.txn);
    if (result.status !== "pending") return reply({ status: result.status });

    // Web push first: tapping it opens AlloCat at the transaction. If it reached
    // the iPhone, the shortcut stays quiet; otherwise it shows its own notice.
    const [push] = await Promise.all([
      notifyUser(owner.userId, pendingPush(result)),
      markShortcutCapture(owner.keyId),
    ]);
    return reply(pendingReply(result, reachedIosDevice(push.deliveredUserAgents)));
  } catch (err) {
    // Never log the request body — it is the user's bank SMS.
    console.warn("[shortcut/sms] ingest failed:", err instanceof Error ? err.message : err);
    return reply({ status: "error" });
  }
}
