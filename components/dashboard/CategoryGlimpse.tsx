"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { useHaptic } from "@/lib/hooks/useHaptic";
import type { DashboardCategory } from "@/lib/hooks/useDashboard";

/** Categories over ~90% of their allocation get a warning tint. */
const WARN_RATIO = 0.9;
const MAX_TILES = 6;

type Tone = "normal" | "warn" | "over";

interface CategoryTile extends DashboardCategory {
  remaining: number;
  pct: number;
  tone: Tone;
}

function toTile(cat: DashboardCategory): CategoryTile {
  const ratio = cat.allocated > 0 ? cat.spent / cat.allocated : 0;
  const tone: Tone =
    cat.spent > cat.allocated && cat.allocated > 0
      ? "over"
      : ratio >= WARN_RATIO && cat.allocated > 0
        ? "warn"
        : "normal";
  return {
    ...cat,
    remaining: cat.allocated - cat.spent,
    pct: cat.allocated > 0 ? Math.min(100, ratio * 100) : 0,
    tone,
  };
}

const BAR_FILL: Record<Tone, string> = {
  normal: "var(--accent-strong)",
  warn: "var(--warn)",
  over: "var(--neg)",
};

/**
 * "Where it's going" — a small horizontal glimpse of how much is left in each
 * budget category this month. Deliberately compact (a scroll strip of tiles,
 * not the budget page's full list); sorted by how close each is to its limit
 * so the ones needing attention lead. Each tile deep-links to its detail.
 */
export default function CategoryGlimpse({
  categories,
}: {
  categories: DashboardCategory[];
}) {
  const haptic = useHaptic();

  const tiles = categories
    .filter((c) => c.allocated > 0)
    .map(toTile)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, MAX_TILES);

  if (tiles.length === 0) return null;

  return (
    <Card compact id="dashboard-category-glimpse">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[12px] font-bold text-foreground">Where it&apos;s going</p>
        <Link
          href="/budget"
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
              href={`/budget/${t.id}`}
              onClick={() => haptic.selection()}
              className="shrink-0 w-[92px] rounded-[13px] bg-tile p-2.5 active:scale-[0.97] transition-transform"
            >
              <span className="text-[15px] leading-none block mb-1.5">{t.icon || "📁"}</span>
              <span
                className="block text-[12px] font-bold tabular-nums leading-none truncate"
                style={{ color: over ? "var(--neg)" : "var(--foreground)" }}
              >
                <CurrencyText value={Math.abs(t.remaining)} maximumFractionDigits={0} />
              </span>
              <span className="block text-[9.5px] font-medium text-muted-foreground mt-0.5 truncate">
                {over ? "over" : "left"} · {t.name}
              </span>
              <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--progress-empty)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${over ? 100 : t.pct}%`, background: BAR_FILL[t.tone] }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
