"use client";

import Link from "next/link";
import QuickSpendInput from "@/components/dashboard/QuickSpendInput";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { useHaptic } from "@/lib/hooks/useHaptic";

interface DashboardProps {
  data: {
    budget: { id: string; totalBudget: number; spent: number; remaining: number } | null;
    categories: { id: string; name: string; icon?: string | null }[];
    goals: { id: string; name: string; icon?: string | null; current_amount: number | string; target_amount: number | string }[];
    netWorthHistory: { net_worth: number | string; snapshot_date: string }[];
  };
}

function NetWorthChart({ data }: { data: { net_worth: number | string; snapshot_date: string }[] }) {
  if (data.length < 2) return null;

  const values = data.map((d) => Number(d.net_worth));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 400;
  const H = 120;
  const pad = 8;

  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (Number(d.net_worth) - min) / range) * (H - pad * 2);
    return `${x},${y}`;
  });

  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `M ${points.join(" L ")} L ${W - pad},${H} L ${pad},${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} fill="none" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#areaGrad)" />
      <path d={linePath} stroke="var(--foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DashboardPage({ data }: DashboardProps) {
  const haptic = useHaptic();

  const currentNetWorth =
    data.netWorthHistory.length > 0
      ? Number(data.netWorthHistory[data.netWorthHistory.length - 1].net_worth)
      : 0;

  let netWorthChange = 0;
  if (data.netWorthHistory.length > 1) {
    const previous = Number(data.netWorthHistory[data.netWorthHistory.length - 2].net_worth);
    if (previous > 0) {
      netWorthChange = Math.round(((currentNetWorth - previous) / previous) * 100);
    }
  }

  const chartLabels = data.netWorthHistory.map((d) => {
    const date = new Date(d.snapshot_date);
    return date.toLocaleString("default", { month: "short" }).toUpperCase();
  });

  const budgetSpentPct =
    data.budget && data.budget.totalBudget > 0
      ? Math.min(100, Math.round((data.budget.spent / data.budget.totalBudget) * 100))
      : 0;

  return (
    <div>
      {/* Header */}
      <div className="fixed w-full top-0 z-10 bg-background">
        <div className="px-7 pt-6 pb-[18px] flex items-end justify-between">
          <div>
            <div className="font-display text-[32px] leading-none tracking-[-0.02em] text-foreground">
              Dashboard
            </div>
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mt-2">
              Financial Overview
            </div>
          </div>
          <div className="md:hidden">
            <Link
              href="/profile"
              className="size-[34px] rounded-full border border-border flex items-center justify-center text-muted-foreground hover:border-foreground transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">person</span>
            </Link>
          </div>
        </div>
        {/* Hairline */}
        <div className="h-px bg-border mx-7" />
      </div>

      <div className="md:grid md:grid-cols-[1fr_1.5fr] md:gap-x-0 mt-20">
        {/* Left column */}
        <div className="md:border-r border-border">
          {/* Budget Summary — clickable, routes to /budget */}
          <Link
            id="dashboard-budget-summary"
            href="/budget"
            onClick={() => haptic.light()}
            className="block px-7 py-6 border-b border-border hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-baseline justify-between mb-3">
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                Budget Remaining
              </div>
              <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground">
                manage →
              </span>
            </div>

            {data.budget ? (
              <>
                <div
                  className="text-[48px] leading-[0.95] tracking-[-0.025em] tabular-nums"
                  style={{ color: data.budget.remaining < 0 ? "#ef4444" : "var(--foreground)" }}
                >
                  <CurrencyText value={data.budget.remaining} />
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between font-mono text-[10px] text-muted-foreground tabular-nums">
                    <span><CurrencyText value={data.budget.spent} /> spent</span>
                    <span>of <CurrencyText value={data.budget.totalBudget} /></span>
                  </div>
                  <div id="dashboard-budget-progress" className="flex gap-[2px]">
                    {Array.from({ length: 30 }).map((_, j) => (
                      <div
                        key={j}
                        className="flex-1"
                        style={{
                          height: 3,
                          background:
                            j / 30 < budgetSpentPct / 100
                              ? data.budget!.spent > data.budget!.totalBudget
                                ? "#ef4444"
                                : "var(--foreground)"
                              : "var(--progress-empty)",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="border border-border py-6 px-4 space-y-3">
                <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground">
                  No allocation set
                </div>
                <div className="font-mono text-[11px] text-muted-foreground leading-relaxed">
                  Create your monthly budget to start tracking spending.
                </div>
                <div className="font-mono text-[10px] tracking-[0.08em] text-foreground">
                  Go to Budget →
                </div>
              </div>
            )}
          </Link>

          {/* Quick Log */}
          {data.budget && data.categories.length > 0 && (
            <div id="dashboard-quick-spend" className="px-7 py-6 border-b border-border md:border-b-0">
              <QuickSpendInput categories={data.categories} />
            </div>
          )}
        </div>

        {/* Right column */}
        <div>
          {/* Net Worth */}
          <div id="dashboard-net-worth-section" className="px-7 py-6 border-b border-border">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2">
                  Net Worth
                </div>
                <CurrencyText
                  value={currentNetWorth}
                  minimumFractionDigits={2}
                  maximumFractionDigits={2}
                  className="text-[36px] leading-none tracking-[-0.02em] text-foreground"
                />
              </div>
              <div className="text-right">
                <div
                  className="font-mono text-[12px] tabular-nums"
                  style={{ color: netWorthChange >= 0 ? "var(--foreground)" : "#ef4444" }}
                >
                  {netWorthChange > 0 ? "+" : ""}{netWorthChange}%
                </div>
                <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted-foreground mt-0.5">
                  Last 6 mo
                </div>
              </div>
            </div>
            <div id="dashboard-net-worth-chart" className="h-[80px] w-full">
              {data.netWorthHistory.length > 1 ? (
                <NetWorthChart data={data.netWorthHistory} />
              ) : (
                <div className="h-full flex items-center justify-center font-mono text-[9px] tracking-[0.1em] uppercase text-muted-foreground">
                  Needs more data
                </div>
              )}
            </div>
            {chartLabels.length > 0 && (
              <div className="flex justify-between mt-1">
                {chartLabels.slice(0, 6).map((m, idx) => (
                  <span key={idx} className="font-mono text-[8px] text-muted-foreground">
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Goals Summary Card */}
          <Link
            id="dashboard-goals-card"
            href="/goals"
            onClick={() => haptic.light()}
            className="block px-7 py-6 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-baseline justify-between mb-4">
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                Goals
              </div>
              <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground">
                {data.goals.length} active →
              </span>
            </div>

            {data.goals.length === 0 ? (
              <div className="border border-border py-5 text-center font-mono text-[9px] tracking-[0.1em] uppercase text-muted-foreground">
                No active goals — tap to add
              </div>
            ) : (
              <div>
                {data.goals.slice(0, 3).map((goal, i) => {
                  const current = Number(goal.current_amount);
                  const target = Number(goal.target_amount);
                  const pct = target > 0 ? Math.min(1, current / target) : 0;
                  const pctDisplay = Math.round(pct * 100);
                  return (
                    <div
                      key={goal.id}
                      style={{
                        borderTop: i === 0 ? "1px solid var(--border)" : "none",
                        borderBottom: "1px solid var(--border)",
                      }}
                      className="py-3"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base grayscale shrink-0">{goal.icon || "🎯"}</span>
                          <span className="text-sm font-medium text-foreground truncate">{goal.name}</span>
                        </div>
                        <span className="font-mono text-[11px] tabular-nums text-foreground shrink-0">{pctDisplay}%</span>
                      </div>
                      <div className="flex gap-[2px]">
                        {Array.from({ length: 10 }).map((_, j) => (
                          <div
                            key={j}
                            className="flex-1"
                            style={{
                              height: 2,
                              background: j / 10 < pct ? "var(--foreground)" : "var(--progress-empty)",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
                {data.goals.length > 3 && (
                  <div className="pt-3 font-mono text-[9px] tracking-[0.1em] uppercase text-muted-foreground">
                    + {data.goals.length - 3} more
                  </div>
                )}
              </div>
            )}
          </Link>
        </div>
      </div>

      <div className="h-28 md:h-8" />
    </div>
  );
}
