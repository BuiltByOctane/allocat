import type { ReactNode } from "react";

type ChipTone = "lime" | "good" | "neutral" | "neg" | "onDark";

const TONES: Record<ChipTone, string> = {
  // Solid lime fill (e.g. cashback "+₹180")
  lime: "bg-accent text-[var(--accent-ink)]",
  // White, bordered status pill (e.g. "On track", "1 active")
  good: "bg-chip text-accent-strong border border-border",
  neutral: "bg-tile text-muted-foreground",
  neg: "bg-chip text-neg border border-border",
  // For use inside dark stat cards
  onDark: "bg-white/[0.14] text-accent border border-transparent",
};

/** Small status/label pill used across cards. */
export function Chip({
  children,
  tone = "good",
  className = "",
}: {
  children: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold leading-none whitespace-nowrap ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
