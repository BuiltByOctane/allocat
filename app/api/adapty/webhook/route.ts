/**
 * Adapty webhook — the server reconciler for native (Play) purchases.
 *
 * Adapty POSTs subscription lifecycle events here; we map them onto the user's
 * `profiles` row so entitlement stays the single server-side source of truth
 * that BOTH the Android app and the web app read. Purchases happen client-side
 * in the native shell (lib/native/adapty.ts); this endpoint is how a purchase
 * made on Android unlocks the web app on the same account.
 *
 * Auth: Adapty must send `Authorization: Bearer <ADAPTY_WEBHOOK_SECRET>`.
 * Identity: we set `customer_user_id` = Supabase user id via adapty.identify().
 *
 * Configure the secret + product ids before going live; until then this route
 * simply rejects unauthenticated calls.
 */
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { PRODUCT_IDS } from "@/lib/subscription/adaptyConfig";

// Constant-time string compare — avoids leaking the secret via response timing.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Event types that mean the subscription is currently entitled.
const ACTIVE_EVENTS = new Set([
  "subscription_initial_purchase",
  "subscription_started",
  "subscription_renewed",
  "subscription_reactivated",
  "trial_started",
  "trial_converted",
  "access_level_updated",
]);

// Event types that mean entitlement has ended.
const EXPIRED_EVENTS = new Set([
  "subscription_expired",
  "subscription_refunded",
  "trial_expired",
]);

type AdaptyEvent = {
  event_type?: string;
  customer_user_id?: string;
  event_properties?: Record<string, unknown> & {
    customer_user_id?: string;
    vendor_product_id?: string;
    subscription_expires_at?: string;
  };
};

function planFromProduct(productId?: string): "monthly" | "yearly" | null {
  if (productId === PRODUCT_IDS.monthly) return "monthly";
  if (productId === PRODUCT_IDS.yearly) return "yearly";
  return null;
}

export async function POST(req: Request) {
  const secret = process.env.ADAPTY_WEBHOOK_SECRET;
  if (!secret) {
    // Not configured yet — fail closed so a misconfigured deploy can't be spoofed.
    return new Response(JSON.stringify({ error: "not_configured" }), {
      status: 503,
    });
  }

  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
    });
  }

  let body: AdaptyEvent;
  try {
    body = (await req.json()) as AdaptyEvent;
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 });
  }

  const eventType = body.event_type ?? "";
  const props = body.event_properties ?? {};
  const userId = body.customer_user_id ?? props.customer_user_id;

  if (!userId) {
    // No account binding — ack so Adapty doesn't retry forever, but do nothing.
    return new Response(JSON.stringify({ ok: true, skipped: "no_user" }), {
      status: 200,
    });
  }

  const update: Record<string, unknown> = {};
  if (ACTIVE_EVENTS.has(eventType)) {
    update.subscription_status = "active";
    update.subscription_expires_at = props.subscription_expires_at ?? null;
    const plan = planFromProduct(props.vendor_product_id);
    if (plan) update.plan = plan;
  } else if (EXPIRED_EVENTS.has(eventType)) {
    update.subscription_status = "expired";
    update.subscription_expires_at = props.subscription_expires_at ?? null;
  } else {
    // Unhandled event — ack without mutating.
    return new Response(JSON.stringify({ ok: true, ignored: eventType }), {
      status: 200,
    });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
