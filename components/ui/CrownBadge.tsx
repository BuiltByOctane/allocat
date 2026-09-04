"use client";

import dynamic from "next/dynamic";

// dotLottie is client-only (touches window/canvas), so load it lazily and skip
// SSR entirely. Renders nothing on the server / first paint.
const DotLottieReact = dynamic(
  () => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact),
  { ssr: false },
);

export interface CrownBadgeProps {
  /** Rendered box size in px (square). */
  size?: number;
  className?: string;
  "aria-label"?: string;
}

/**
 * Animated crown (public/lottie/crown.lottie) — the thank-you mark for people
 * who've supported AlloCat on Ko-fi. Purely decorative: it does no check of its
 * own, so callers gate on `useIsSupporter()`. Autoplays on a loop, subtle and
 * inline. Nothing in the app is ever gated on this being visible.
 */
export function CrownBadge({
  size = 24,
  className = "",
  "aria-label": ariaLabel = "Supporter",
}: CrownBadgeProps) {
  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <DotLottieReact
        src="/lottie/crown.lottie"
        autoplay
        loop
        style={{ width: size, height: size }}
      />
    </span>
  );
}

export default CrownBadge;
