"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { Progress, type ProgressState } from "@/components/ui/Progress";
import { useHaptic } from "@/lib/hooks/useHaptic";
import type { DashboardCategory } from "@/lib/hooks/useDashboard";

/** Categories over ~90% of their allocation get a warning tint. */
const WARN_RATIO = 0.9;
const MAX_ROWS = 5;

interface CategoryRow extends DashboardCategory {
  remaining: number;
  pct: number;
  state: ProgressState;
}

function toRow(cat: DashboardCategory): CategoryRow {
  const ratio = cat.allocated > 0 ? cat.spent / cat.allocated : 0;
  const state: ProgressState =
    cat.spent > cat.allocated && cat.allocated > 0
      ? "over"
      : ratio >= WARN_RATIO && cat.allocated > 0
        ? "warn"
        : "normal";
  return {
    ...cat,
    remaining: cat.allocated - cat.spent,
    pct: cat.allocated > 0 ? Math.min(100, ratio * 100) : 0,
    state,
  };
}

/**
 * "Where it's going" — a compact per-category glimpse of how much is left in
 * each budget category this month. Only categories with an allocation are
 * shown (a zero-allocation category has nothing to run down); sorted by how
 * close they are to their limit so the ones that need attention float up.
 * Each row deep-links to its category detail.
 */
export default function CategoryGlimpse({
  categories,
}: {
  categories: DashboardCategory[];
}) {
  const haptic = useHaptic();

  const rows = categories
    .filter((c) => c.allocated > 0)
    .map(toRow)
    .sort((a, b) => b.pct - a.pct);

  if (rows.length === 0) return null;

  const shown = rows.slice(0, MAX_ROWS);
  const hiddenCount = rows.length - shown.length;

  return (
    <Card compact id="dashboard-category-glimpse">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-bold text-foreground">Where it&apos;s going</p>
        <Link
          href="/budget"
          onClick={() => haptic.light()}
          className="text-[11px] font-semibold text-accent-strong active:opacity-70"
        >
          View all →
        </Link>
      </div>

      <ul className="flex flex-col gap-3">
        {shown.map((row) => {
          const over = row.state === "over";
          return (
            <li key={row.id}>
              <Link
                href={`/budget/${row.id}`}
                onClick={() => haptic.selection()}
                className="block active:opacity-70 transition-opacity"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="flex items-center gap-2 min-w-0">
                    {row.icon && (
                      <span className="text-[15px] leading-none shrink-0">{row.icon}</span>
                    )}
                    <span className="text-[12.5px] font-semibold text-foreground truncate">
                      {row.name}
                    </span>
                  </span>
                  <span
                    className="text-[11.5px] font-semibold tabular-nums shrink-0"
                    style={{ color: over ? "var(--neg)" : "var(--muted-foreground)" }}
                  >
                    {over ? (
                      <>
                        Over by <CurrencyText value={Math.abs(row.remaining)} />
                      </>
                    ) : (
                      <>
                        <CurrencyText value={row.remaining} /> left
                      </>
                    )}
                  </span>
                </div>
                <Progress
                  value={over ? 100 : row.pct}
                  state={row.state}
                  color={over ? "var(--neg)" : undefined}
                />
              </Link>
            </li>
          );
        })}
      </ul>

      {hiddenCount > 0 && (
        <p className="mt-3 text-[10.5px] font-medium text-muted-foreground">
          +{hiddenCount} more {hiddenCount === 1 ? "category" : "categories"}
        </p>
      )}
    </Card>
  );
}
