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
 * Animated premium crown (public/lottie/crown.lottie). Render this only when the
 * user is premium — it has no entitlement check of its own so it can be reused
 * in any premium-gated spot. Autoplays on a loop, subtle and inline.
 */
export function CrownBadge({
  size = 24,
  className = "",
  "aria-label": ariaLabel = "Premium",
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
