/**
 * Adapty (Google Play Billing) — native Android only.
 *
 * Purchases run client-side here. The SERVER source of truth is updated only by
 * the signed Adapty webhook (/api/adapty/webhook); the client never writes
 * `active` to Supabase (a tampered client must not be able to self-grant
 * premium). After a successful native purchase the caller reflects entitlement
 * optimistically in local IDB for immediacy, and the webhook persists it to
 * Supabase within seconds (which the web app then reads on next hydrate).
 *
 * Web has no native billing — every method here guards on isNativePlatform and
 * the `@adapty/capacitor` plugin throws "not implemented" on web if called.
 */
import { Capacitor } from "@capacitor/core";
import { adapty } from "@adapty/capacitor";
import {
  ACCESS_LEVEL,
  PLACEMENT_ID,
  PRODUCT_IDS,
} from "@/lib/subscription/adaptyConfig";

export { ACCESS_LEVEL, PLACEMENT_ID, PRODUCT_IDS };

const PUBLIC_KEY = process.env.NEXT_PUBLIC_ADAPTY_PUBLIC_KEY;

export interface EntitlementSnapshot {
  isActive: boolean;
  expiresAt: string | null;
}

function native(): boolean {
  return Capacitor.isNativePlatform();
}

/** True when the SDK can actually run (native shell + key configured). */
export function isAdaptyReady(): boolean {
  return native() && !!PUBLIC_KEY;
}

/** Activate the SDK once on app launch. Safe to call on web (no-ops). */
export async function activateAdapty(userId?: string): Promise<void> {
  if (!isAdaptyReady()) return;
  try {
    await adapty.activate({
      apiKey: PUBLIC_KEY!,
      params: userId ? { customerUserId: userId } : undefined,
    });
  } catch (e) {
    console.warn("[adapty] activate failed", e);
  }
}

/** Bind purchases to the Supabase account so entitlement maps across devices. */
export async function identifyAdapty(userId: string): Promise<void> {
  if (!isAdaptyReady()) return;
  try {
    await adapty.identify({ customerUserId: userId });
  } catch (e) {
    console.warn("[adapty] identify failed", e);
  }
}

function snapshotFromProfile(profile: unknown): EntitlementSnapshot {
  // profile.accessLevels[ACCESS_LEVEL] → { isActive, expiresAt }
  const level = (
    profile as {
      accessLevels?: Record<string, { isActive?: boolean; expiresAt?: string | null }>;
    }
  )?.accessLevels?.[ACCESS_LEVEL];
  return {
    isActive: Boolean(level?.isActive),
    expiresAt: level?.expiresAt ?? null,
  };
}

/**
 * Run the purchase flow for a plan. Returns the resulting entitlement snapshot
 * (or null if cancelled/pending/failed). The webhook persists the authoritative
 * server state; the caller only uses this to reflect locally.
 */
export async function purchase(
  plan: "monthly" | "yearly",
): Promise<EntitlementSnapshot | null> {
  if (!isAdaptyReady()) return null;
  try {
    const paywall = await adapty.getPaywall({ placementId: PLACEMENT_ID });
    const products = await adapty.getPaywallProducts({ paywall });
    const product = products.find(
      (p) => p.vendorProductId === PRODUCT_IDS[plan],
    );
    if (!product) {
      console.warn(`[adapty] product not found for ${plan}`);
      return null;
    }
    const result = await adapty.makePurchase({ product });
    if (result.type !== "success") return null;
    return snapshotFromProfile(result.profile);
  } catch (e) {
    console.warn("[adapty] purchase failed", e);
    return null;
  }
}

/** Restore prior purchases (reinstall / new device). */
export async function restorePurchases(): Promise<EntitlementSnapshot | null> {
  if (!isAdaptyReady()) return null;
  try {
    const profile = await adapty.restorePurchases();
    return snapshotFromProfile(profile);
  } catch (e) {
    console.warn("[adapty] restore failed", e);
    return null;
  }
}

/** Read the live entitlement from Adapty (native only). */
export async function getEntitlementSnapshot(): Promise<EntitlementSnapshot | null> {
  if (!isAdaptyReady()) return null;
  try {
    const profile = await adapty.getProfile();
    return snapshotFromProfile(profile);
  } catch (e) {
    console.warn("[adapty] getProfile failed", e);
    return null;
  }
}
