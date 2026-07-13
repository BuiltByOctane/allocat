"use client";

export interface QuizChipProps {
  label: string;
  active: boolean;
  onToggle: () => void;
}

/** Multi-select chip (Q2 Life, Q4 Treat). */
export function QuizChip({ label, active, onToggle }: QuizChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
        active
          ? "bg-accent text-[var(--accent-ink)]"
          : "border border-white/12 bg-white/[0.06] text-white/70"
      }`}
    >
      {label}
    </button>
  );
}
