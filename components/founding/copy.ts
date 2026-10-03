import type { ClaimState } from "@/lib/hooks/useFoundingMember";

export const FOUNDING_CONFIRMATION =
  "You're in! We'll let you know as soon as Premium launches — your founding-member pricing is locked.";

/** User-facing line for a failed claim, or null when there's nothing to say. */
export function claimErrorCopy(state: ClaimState): string | null {
  switch (state) {
    case "offline":
      return "Connect to the internet to claim your spot.";
    case "closed":
      return "Founding spots are closed.";
    case "error":
      return "Couldn't claim right now — try again in a bit.";
    default:
      return null;
  }
}
