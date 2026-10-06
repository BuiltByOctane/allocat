/** Client-safe constants shared by the iPhone setup card and the public guide. */

/** iCloud link of the published "AlloCat Log" shortcut. Unset until it is published. */
export const IOS_SHORTCUT_URL: string | null =
  process.env.NEXT_PUBLIC_IOS_SHORTCUT_URL || null;

export const IOS_GUIDE_PATH = "/guides/iphone-sms";

/** Name of the shared shortcut as it appears in the Shortcuts app. */
export const IOS_SHORTCUT_NAME = "AlloCat Log";

/** Keywords we recommend, one automation each. */
export const IOS_KEYWORDS = [
  { word: "debited", note: "Most bank and UPI debit messages" },
  { word: "spent", note: "Credit and debit card spends" },
] as const;

/** True on iPhone / iPad Safari (iPadOS reports a Mac UA, hence the touch check). */
export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}
