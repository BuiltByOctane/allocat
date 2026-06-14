/**
 * Plain Adapty config shared by client (lib/native/adapty.ts) and server
 * (app/api/adapty/webhook). Kept free of the `@adapty/capacitor` plugin import
 * so the server webhook can read product ids without pulling a native plugin.
 */

/** Adapty access-level id (create it in the Adapty dashboard). */
export const ACCESS_LEVEL = "premium";

/** Adapty placement id whose paywall contains both plan products. */
export const PLACEMENT_ID = "premium";

/**
 * Vendor (store) product ids as they appear in Adapty for each plan. For Google
 * Play subscriptions with base plans the id often looks like
 * `allocat_premium:monthly`. Set these to whatever Adapty reports as each
 * product's `vendorProductId`.
 */
export const PRODUCT_IDS: Record<"monthly" | "yearly", string> = {
  monthly: "allocat_premium_monthly",
  yearly: "allocat_premium_yearly",
};
