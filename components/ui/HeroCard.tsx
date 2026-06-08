import type { ReactNode } from "react";

/**
 * The lime hero card — the one punchy accent surface per screen. Faint repeating
 * "AlloCat" wordmark watermark, a label + status chip header, a big figure, then
 * optional progress/meta and a CTA passed as children.
 */
export function HeroCard({
  label,
  chip,
  value,
  watermark = true,
  children,
  className = "",
}: {
  label?: ReactNode;
  chip?: ReactNode;
  value: ReactNode;
  /** Show the repeating AlloCat wordmark texture. */
  watermark?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-card bg-accent p-[18px] text-[var(--accent-ink)] ${
        watermark ? "wordmark-watermark" : ""
      } ${className}`}
    >
      {(label || chip) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-[11.5px] font-semibold text-[var(--accent-ink)]">{label}</span>}
          {chip}
        </div>
      )}
      <div className="figure text-[44px] leading-[0.92] my-1.5" style={{ color: "#1b210a" }}>
        {value}
      </div>
      {children}
    </div>
  );
}
