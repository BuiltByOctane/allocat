"use client";

export interface QuizOptionCardProps {
  label: string;
  sublabel?: string;
  active: boolean;
  onSelect: () => void;
}

/** Single-select big card (Q1 Habit, Q3 Dream) - tap selects and the caller
 *  auto-advances, matching the "one tap, no forms" pattern. */
export function QuizOptionCard({ label, sublabel, active, onSelect }: QuizOptionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-2xl border p-4 text-left transition-colors ${
        active
          ? "border-transparent bg-white/[0.08] ring-2 ring-[var(--accent-strong)]"
          : "border-white/12 bg-white/[0.03] active:bg-white/[0.06]"
      }`}
    >
      <div className="text-[14.5px] font-bold text-white">{label}</div>
      {sublabel ? <div className="mt-1 text-[12.5px] text-white/45">{sublabel}</div> : null}
    </button>
  );
}
