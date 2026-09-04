"use client";

import { useProfile } from "@/lib/hooks/useProfile";

/**
 * Whether the user has chipped in via Ko-fi.
 *
 * Purely cosmetic — it draws a thank-you badge and swaps some copy. Nothing in
 * the app is gated on it; AlloCat is free for everyone. Reads the already
 * hydrated profile row, so there's no extra provider or network call.
 */
export function useIsSupporter(): boolean {
  const { data: profile } = useProfile();
  return profile?.is_supporter ?? false;
}

/** ISO timestamp of the first donation, or null. */
export function useSupporterSince(): string | null {
  const { data: profile } = useProfile();
  return profile?.supporter_since ?? null;
}
