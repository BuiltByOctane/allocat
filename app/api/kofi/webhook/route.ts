/**
 * Ko-fi webhook — records optional donations.
 *
 * AlloCat is free; supporting is a tip, not a purchase. Nothing here unlocks a
 * feature — the only effect is `profiles.is_supporter`, which draws a cosmetic
 * thank-you badge. Card data never touches AlloCat: Ko-fi handles payment and
 * sends us an email, an amount and a message id.
 *
 * Ko-fi POSTs `application/x-www-form-urlencoded` with a single `data` field
 * holding a JSON string, including a `verification_token` copied from the Ko-fi
 * webhook settings page. It retries on any non-2xx, so once the token checks out
 * we always ack — `last_message_id` makes replays idempotent.
 */
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

// Explicit content-type; the platform default is text/plain.
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Constant-time compare — avoids leaking the token via response timing.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Ko-fi sends shop orders through the same hook; we only care about money in.
const DONATION_TYPES = new Set(["Donation", "Subscription", "Commission"]);

type KofiPayload = {
  verification_token?: string;
  message_id?: string;
  type?: string;
  email?: string;
  amount?: string;
  currency?: string;
  timestamp?: string;
};

export async function POST(req: Request) {
  const token = process.env.KOFI_VERIFICATION_TOKEN;
  if (!token) {
    // Not configured — fail closed so a half-deployed env can't be spoofed.
    return json({ error: "not_configured" }, 503);
  }

  let payload: KofiPayload;
  try {
    const form = await req.formData();
    const raw = form.get("data");
    if (typeof raw !== "string") throw new Error("missing data field");
    payload = JSON.parse(raw) as KofiPayload;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  if (!safeEqual(payload.verification_token ?? "", token)) {
    return json({ error: "unauthorized" }, 401);
  }

  // ── From here on: always 2xx, so Ko-fi stops retrying. ────────────────────
  const type = payload.type ?? "";
  if (!DONATION_TYPES.has(type)) {
    return json({ ok: true, ignored: type });
  }

  const email = payload.email?.trim().toLowerCase();
  const messageId = payload.message_id;
  if (!email || !messageId) {
    return json({ ok: true, skipped: "no_email_or_message_id" });
  }

  const amount = Number.parseFloat(payload.amount ?? "0");
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("supporters")
    .select("email, total_amount, last_message_id")
    .eq("email", email)
    .maybeSingle();

  // Ko-fi retry of an event we already banked — nothing to do.
  if (existing?.last_message_id === messageId) {
    return json({ ok: true, duplicate: true });
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await supabase.from("supporters").upsert(
    {
      email,
      last_supported_at: now,
      total_amount: (existing?.total_amount ?? 0) + (Number.isFinite(amount) ? amount : 0),
      currency: payload.currency ?? null,
      source: "kofi",
      last_message_id: messageId,
      ...(existing ? {} : { first_supported_at: now }),
    },
    { onConflict: "email" },
  );

  if (upsertError) {
    // Real storage failure — let Ko-fi retry this one.
    return json({ error: upsertError.message }, 500);
  }

  // Link to an account if one already exists for this email. If not, the user
  // picks the badge up on next sign-in via syncSupporterStatus().
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, supporter_since")
    .eq("email", email)
    .maybeSingle();

  if (profile) {
    await supabase
      .from("profiles")
      .update({
        is_supporter: true,
        supporter_since: profile.supporter_since ?? now,
      })
      .eq("id", profile.id);

    await supabase.from("supporters").update({ user_id: profile.id }).eq("email", email);
  }

  return json({ ok: true, linked: Boolean(profile) });
}

// Liveness probe — confirms the route is deployed, returns no data.
export async function GET() {
  return json({ ok: true, service: "kofi-webhook" });
}
