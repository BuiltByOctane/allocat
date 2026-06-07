/**
 * Unified progress indicator — replaces the per-page TickRuler / SegBar copies.
 *
 * variant:
 *   "ticks"    — 41 vertical tick marks (the budget hero's signature ruler)
 *   "segments" — N filled segments (category/debt/goal bars)
 *   "solid"    — a single continuous fill
 * state: drives fill color when no explicit `color` is given —
 *   "normal" → foreground, "warn" → --warn, "over" → --neg
 */

export type ProgressVariant = "ticks" | "segments" | "solid";
export type ProgressState = "normal" | "warn" | "over";

interface ProgressProps {
  /** 0–100 */
  value: number;
  variant?: ProgressVariant;
  state?: ProgressState;
  /** Explicit fill (e.g. a category color `var(--cat-3)`). Overrides `state`. */
  color?: string;
  /** Segment count for the "segments" variant. */
  segments?: number;
  className?: string;
}

const STATE_FILL: Record<ProgressState, string> = {
  normal: "var(--foreground)",
  warn: "var(--warn)",
  over: "var(--neg)",
};

const EMPTY = "var(--progress-empty)";

export function Progress({
  value,
  variant = "solid",
  state = "normal",
  color,
  segments = 20,
  className = "",
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = color ?? STATE_FILL[state];

  if (variant === "ticks") {
    const count = 41;
    return (
      <div className={`relative h-[18px] ${className}`}>
        <div className="absolute inset-0 flex justify-between">
          {Array.from({ length: count }).map((_, i) => {
            const filled = i / (count - 1) <= pct / 100;
            const h = i % 10 === 0 ? 14 : i % 5 === 0 ? 9 : 5;
            return (
              <div
                key={i}
                style={{ width: 1, height: h, background: filled ? fill : EMPTY }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  if (variant === "segments") {
    return (
      <div className={`flex gap-[2px] ${className}`}>
        {Array.from({ length: segments }).map((_, j) => (
          <div
            key={j}
            className="flex-1"
            style={{
              height: 3,
              background: j / segments < pct / 100 ? fill : EMPTY,
            }}
          />
        ))}
      </div>
    );
  }

  // solid
  return (
    <div
      className={`w-full overflow-hidden ${className}`}
      style={{ height: 3, background: EMPTY }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div style={{ width: `${pct}%`, height: "100%", background: fill }} />
    </div>
  );
}
