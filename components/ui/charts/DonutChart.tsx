"use client";

import { useState } from "react";

export interface DonutSlice {
  id: string;
  label: string;
  value: number;
  /** CSS color (e.g. `var(--cat-3)`). */
  color: string;
}

interface DonutChartProps {
  data: DonutSlice[];
  /** SVG square size in px. */
  size?: number;
  /** Center caption under the highlighted percentage. */
  centerLabel?: string;
  formatValue?: (value: number) => string;
}

/**
 * Editorial donut: hue-coded arcs (not an opacity ramp) with a synced,
 * tappable legend. Tapping a slice/legend row highlights it — others dim and
 * the center shows that slice's share. Tap again to clear.
 */
export function DonutChart({
  data,
  size = 160,
  centerLabel,
  formatValue,
}: DonutChartProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const slices = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const total = slices.reduce((s, d) => s + d.value, 0);

  const r = 40;
  const circ = 2 * Math.PI * r;
  const gap = total > 0 && slices.length > 1 ? 1.5 : 0;

  const selectedSlice = slices.find((s) => s.id === selected) ?? null;
  const centerPct =
    selectedSlice && total > 0
      ? `${((selectedSlice.value / total) * 100).toFixed(0)}%`
      : null;

  let offsetAcc = 0;

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
          <circle cx="80" cy="80" r={r} fill="none" className="stroke-muted/20" strokeWidth="80" />
          {total > 0 &&
            slices.map((slice) => {
              const pct = slice.value / total;
              const dash = Math.max(pct * circ - gap, 0);
              const offset = -offsetAcc;
              offsetAcc += pct * circ;
              const dim = selected !== null && selected !== slice.id;
              return (
                <circle
                  key={slice.id}
                  cx="80"
                  cy="80"
                  r={r}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth="80"
                  strokeDasharray={`${dash} ${circ}`}
                  strokeDashoffset={offset}
                  strokeLinecap="butt"
                  style={{ opacity: dim ? 0.2 : 1, transition: "opacity 0.2s" }}
                />
              );
            })}
        </svg>
        {centerPct && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-display text-[22px] tabular-nums text-foreground leading-none">
              {centerPct}
            </span>
            {centerLabel && (
              <span className="t-label-sm text-muted-foreground mt-1">{centerLabel}</span>
            )}
          </div>
        )}
      </div>

      {slices.length > 0 && (
        <div className="w-full mt-5 space-y-1 px-1">
          {slices.map((slice) => {
            const pct =
              total > 0
                ? ((slice.value / total) * 100).toFixed(1).replace(/\.0$/, "")
                : "0";
            const active = selected === slice.id;
            return (
              <button
                key={slice.id}
                onClick={() => setSelected(active ? null : slice.id)}
                className={`flex items-center justify-between w-full text-xs py-1 px-1 -mx-1 rounded transition-colors ${
                  active ? "bg-muted/60" : "hover:bg-muted/30"
                }`}
                aria-pressed={active}
              >
                <span className="flex items-center gap-2 flex-1 min-w-0 pr-3">
                  <span
                    className="w-3 h-3 shrink-0 rounded-[3px]"
                    style={{ background: slice.color }}
                  />
                  <span className="text-muted-foreground truncate uppercase tracking-wider text-[10px] font-medium">
                    {slice.label}
                  </span>
                </span>
                <span className="flex items-baseline gap-2 shrink-0">
                  {formatValue && (
                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                      {formatValue(slice.value)}
                    </span>
                  )}
                  <span className="font-semibold tabular-nums text-foreground">{pct}%</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
