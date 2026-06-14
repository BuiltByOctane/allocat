/**
 * Adapty (Google Play Billing) integration point — native Android only.
 *
 * STATUS: scaffold. `@adapty/capacitor` is NOT installed yet and no Adapty
 * project / Play Console products exist. Every function here is guarded by
 * `Capacitor.isNativePlatform()` and currently no-ops (warns) so the app builds
 * and runs unchanged on web and on a native shell without the SDK.
 *
 * TO ACTIVATE (Phase 3):
 *   1. `pnpm add @adapty/capacitor` and `npx cap sync android`.
 *   2. Create the Adapty project; put the public SDK key in
 *      NEXT_PUBLIC_ADAPTY_PUBLIC_KEY.
 *   3. Google Play Console: create subscription product `allocat_premium`
 *      with base plans whose ids match PRODUCT_IDS below; link them in Adapty.
 *   4. Uncomment the real SDK calls in each function (the commented blocks).
 *   5. Set ADAPTY_WEBHOOK_SECRET and point the Adapty webhook at
 *      /api/adapty/webhook so server entitlement stays the source of truth.
 *
 * Purchases MUST run client-side here (the billing flow lives in the native
 * bridge); the server only reconciles via the webhook.
 */
import { Capacitor } from "@capacitor/core";

/** Map our plan ids to the Play / Adapty vendor product (base-plan) ids. */
export const PRODUCT_IDS: Record<"monthly" | "yearly", string> = {
  monthly: "allocat_premium_monthly",
  yearly: "allocat_premium_yearly",
};

const PUBLIC_KEY = process.env.NEXT_PUBLIC_ADAPTY_PUBLIC_KEY;

function native(): boolean {
  return Capacitor.isNativePlatform();
}

/** True once the SDK is installed, keyed, and running on a native shell. */
export function isAdaptyReady(): boolean {
  return native() && !!PUBLIC_KEY && false; // flip to `true` when SDK wired
}

/** Activate the SDK once on app launch (native only). */
export async function activateAdapty(): Promise<void> {
  if (!native() || !PUBLIC_KEY) return;
  // const { adapty } = await import("@adapty/capacitor");
  // await adapty.activate({ apiKey: PUBLIC_KEY });
  console.info("[adapty] activate (stub) — SDK not installed");
}

/** Bind purchases to the Supabase account so entitlement maps across devices. */
export async function identifyAdapty(userId: string): Promise<void> {
  if (!native() || !PUBLIC_KEY) return;
  // const { adapty } = await import("@adapty/capacitor");
  // await adapty.identify({ customerUserId: userId });
  console.info(`[adapty] identify ${userId} (stub)`);
}

/**
 * Run the purchase flow for a plan. Returns true on a successful purchase.
 * On success the Adapty webhook flips profiles.subscription_status server-side;
 * we also call syncEntitlementToServer() as a belt-and-suspenders refresh.
 */
export async function purchase(plan: "monthly" | "yearly"): Promise<boolean> {
  if (!native()) return false;
  // const { adapty } = await import("@adapty/capacitor");
  // const paywall = await adapty.getPaywall({ placementId: "premium" });
  // const products = await adapty.getPaywallProducts({ paywall });
  // const product = products.find(p => p.vendorProductId === PRODUCT_IDS[plan]);
  // if (!product) return false;
  // const result = await adapty.makePurchase({ product });
  // return result.type === "success";
  console.info(`[adapty] purchase ${PRODUCT_IDS[plan]} (stub)`);
  return false;
}

/** Restore prior purchases (e.g. reinstall / new device). */
export async function restorePurchases(): Promise<boolean> {
  if (!native()) return false;
  // const { adapty } = await import("@adapty/capacitor");
  // const profile = await adapty.restorePurchases();
  // return Boolean(profile.accessLevels?.premium?.isActive);
  console.info("[adapty] restore (stub)");
  return false;
}

/**
 * Read the live Adapty profile and, if it disagrees with the server, push the
 * current entitlement to Supabase. Called on native app open so a purchase that
 * the webhook missed still unlocks the web app. (Implemented in Phase 3.)
 */
export async function syncEntitlementToServer(): Promise<void> {
  if (!isAdaptyReady()) return;
  // const { adapty } = await import("@adapty/capacitor");
  // const profile = await adapty.getProfile();
  // → POST minimal entitlement to a server action that updates profiles.
}
