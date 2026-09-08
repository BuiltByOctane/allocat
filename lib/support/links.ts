/**
 * Where "support the dev" points.
 *
 * Supporting AlloCat is a tip, not a purchase — it unlocks nothing, and payment
 * happens entirely on Ko-fi. On Android the link opens in the system browser
 * (never an in-app checkout). Whether the button shows there at all is the
 * `support_cta_native` runtime flag (lib/config/flags.ts) — DB-backed, so it can
 * be pulled mid-Play-review without shipping a new build. NEXT_PUBLIC_SUPPORT_CTA_NATIVE
 * remains its default.
 */
export const KOFI_URL =
  process.env.NEXT_PUBLIC_KOFI_URL ?? "https://ko-fi.com/allocat";

/** Shown instead of the button when the native CTA is switched off. */
export const SUPPORT_WEB_URL = "https://allocat.xyz/support";

export const SUPPORT_CONTACT_EMAIL = "innovationsoctane@gmail.com";
