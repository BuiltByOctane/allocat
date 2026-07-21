"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { useHaptic } from "@/lib/hooks/useHaptic";
import type { DashboardItem } from "@/lib/hooks/useDashboard";

/** Items over ~90% of their allocation get a warning tint. */
const WARN_RATIO = 0.9;
const MAX_TILES = 8;

type Tone = "normal" | "warn" | "over";

interface Tile extends DashboardItem {
  remaining: number;
  pct: number;
  tone: Tone;
}

function toTile(it: DashboardItem): Tile {
  const ratio = it.planned > 0 ? it.actual / it.planned : 0;
  const tone: Tone =
    it.actual > it.planned && it.planned > 0
      ? "over"
      : ratio >= WARN_RATIO && it.planned > 0
        ? "warn"
        : "normal";
  return {
    ...it,
    remaining: it.planned - it.actual,
    pct: it.planned > 0 ? Math.min(100, ratio * 100) : 0,
    tone,
  };
}

const BAR_FILL: Record<Tone, string> = {
  normal: "var(--accent-strong)",
  warn: "var(--warn)",
  over: "var(--neg)",
};

/**
 * "Top spending" — a small horizontal strip of the budget items you've spent
 * the most on this month, with the ones closest to their limit surfaced by
 * color. Deliberately compact (a scroll strip of tiles, not the budget page's
 * full list). Each tile deep-links to the item's category detail.
 */
export default function TopSpendingGlimpse({
  items,
}: {
  items: DashboardItem[];
}) {
  const haptic = useHaptic();

  const tiles = items
    .filter((it) => it.actual > 0)
    .map(toTile)
    // Highest spend first; ties broken by how close to the limit (near-done up).
    .sort((a, b) => b.actual - a.actual || b.pct - a.pct)
    .slice(0, MAX_TILES);

  if (tiles.length === 0) return null;

  return (
    <Card compact id="dashboard-top-spending">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[12px] font-bold text-foreground">Top spending</p>
        <Link
          href="/transactions"
          onClick={() => haptic.light()}
          className="text-[11px] font-semibold text-accent-strong active:opacity-70"
        >
          View all →
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto overscroll-x-contain -mx-0.5 px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tiles.map((t) => {
          const over = t.tone === "over";
          return (
            <Link
              key={t.id}
              href={`/budget/${t.categoryId}`}
              onClick={() => haptic.selection()}
              className="shrink-0 w-[96px] rounded-[13px] bg-tile p-2.5 active:scale-[0.97] transition-transform"
            >
              <span className="text-[15px] leading-none block mb-1.5">{t.emoji || "💸"}</span>
              <span className="block text-[12px] font-bold tabular-nums leading-none truncate text-foreground">
                <CurrencyText value={t.actual} maximumFractionDigits={0} />
              </span>
              <span className="block text-[9.5px] font-medium text-muted-foreground mt-0.5 truncate">
                {t.name}
              </span>
              <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--progress-empty)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${over ? 100 : t.pct}%`, background: BAR_FILL[t.tone] }}
                />
              </div>
              {t.planned > 0 && (
                <span
                  className="block text-[9px] font-semibold tabular-nums mt-1 truncate"
                  style={{ color: over ? "var(--neg)" : "var(--muted-foreground)" }}
                >
                  {over ? (
                    <>
                      <CurrencyText value={Math.abs(t.remaining)} maximumFractionDigits={0} /> over
                    </>
                  ) : (
                    <>
                      <CurrencyText value={t.remaining} maximumFractionDigits={0} /> left
                    </>
                  )}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
