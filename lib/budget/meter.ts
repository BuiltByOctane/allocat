import type { ProgressState } from "@/components/ui/Progress";

/** Below this share of the allocation left, a budget bar turns amber. */
export const LOW_LEFT_RATIO = 0.2;

export interface BudgetMeter {
  /** Share of the allocation still unspent, 0–100 — the bar's width. */
  leftPct: number;
  over: boolean;
  low: boolean;
  state: ProgressState;
}

/**
 * Budget bars drain (full at the start, empty when used up) — the opposite of
 * goal/net-worth bars, which fill toward a target. Overspend can't be shown by
 * an empty bar, so callers tint the whole row when `over` is true.
 */
export function budgetMeter(spent: number, allocated: number): BudgetMeter {
  if (allocated <= 0) return { leftPct: 0, over: false, low: false, state: "normal" };
  const leftRatio = Math.max(0, (allocated - spent) / allocated);
  const over = spent > allocated;
  const low = !over && leftRatio < LOW_LEFT_RATIO;
  return {
    leftPct: leftRatio * 100,
    over,
    low,
    state: over ? "over" : low ? "warn" : "normal",
  };
}

/** Inline style for an overspent row/card: soft red tint + red ring. */
export const OVER_SURFACE_STYLE = {
  background: "color-mix(in srgb, var(--neg) 7%, var(--card))",
  boxShadow: "inset 0 0 0 1.5px color-mix(in srgb, var(--neg) 55%, transparent)",
} as const;
