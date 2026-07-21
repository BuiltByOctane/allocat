"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import QuickSpendInput from "@/components/dashboard/QuickSpendInput";
import TopSpendingGlimpse from "@/components/dashboard/TopSpendingGlimpse";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Chip } from "@/components/ui/Chip";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useProfile } from "@/lib/hooks/useProfile";
import { useIsPremium } from "@/lib/providers/EntitlementProvider";
import { CrownBadge } from "@/components/ui/CrownBadge";
import { getTimeGreeting } from "@/lib/utils/greeting";
import { projectMonthSpend } from "@/lib/sms/insightStats";
import type { DashboardCategory, DashboardItem } from "@/lib/hooks/useDashboard";

interface DashboardProps {
  data: {
    budget: { id: string; totalBudget: number; spent: number; remaining: number } | null;
    categories: DashboardCategory[];
    items: DashboardItem[];
    goals: { id: string; name: string; icon?: string | null; current_amount: number | string; target_amount: number | string }[];
    netWorthHistory: { net_worth: number | string; snapshot_date: string }[];
  };
}

// Greeting depends on the live clock. Computed once and cached so it can serve
// as a stable useSyncExternalStore snapshot, and kept in a module fn (not a
// component/hook) so the impure Date call doesn't trip the react-hooks purity
// rule. The witty subline was dropped in favor of a static one.
let greetingCache: string | null = null;
function getGreetingSnapshot(): string {
  if (!greetingCache) {
    greetingCache = getTimeGreeting(new Date().getHours());
  }
  return greetingCache;
}
const subscribeNoop = () => () => {};

// Current-month day math (day-of-month, days in month, days remaining).
// Date-dependent + impure, so it lives in a module fn served through
// useSyncExternalStore (null on server/first paint) to avoid an SSR/client
// hydration mismatch. Mirrors the math in lib/sms/insightStats.ts.
interface MonthSnapshot {
  daysElapsed: number;
  daysInMonth: number;
  daysLeft: number;
}
let monthCache: MonthSnapshot | null = null;
function getMonthSnapshot(): MonthSnapshot {
  if (!monthCache) {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysElapsed = now.getDate();
    monthCache = { daysElapsed, daysInMonth, daysLeft: daysInMonth - daysElapsed };
  }
  return monthCache;
}

function daysLeftLabel(daysLeft: number): string {
  if (daysLeft <= 0) return "Last day";
  if (daysLeft === 1) return "1 day left";
  return `${daysLeft} days left`;
}

export default function DashboardPage({ data }: DashboardProps) {
  const haptic = useHaptic();
  const { data: profile } = useProfile();
  const isPremium = useIsPremium();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? "";

  // Server (and first client render) get null to match SSR markup; after
  // hydration useSyncExternalStore re-renders with the cached values. No
  // synchronous setState-in-effect, so React 19's cascading-render warning
  // never fires.
  const greeting = useSyncExternalStore(subscribeNoop, getGreetingSnapshot, () => null);
  const month = useSyncExternalStore(subscribeNoop, getMonthSnapshot, () => null);

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

  const budgetSpentPct =
    data.budget && data.budget.totalBudget > 0
      ? Math.min(100, Math.round((data.budget.spent / data.budget.totalBudget) * 100))
      : 0;
  const overBudget = !!data.budget && data.budget.spent > data.budget.totalBudget;

  // Forward-looking pace: linear month-end projection from spend-so-far vs the
  // total budget. null until the clock snapshot hydrates (and only meaningful
  // once there's a budget with a positive total and some spend to project).
  let projected: number | null = null;
  let offPace = false;
  if (month && data.budget && data.budget.totalBudget > 0 && data.budget.spent > 0) {
    projected = projectMonthSpend(data.budget.spent, month.daysElapsed, month.daysInMonth);
    offPace = !overBudget && projected > data.budget.totalBudget;
  }
  const paceOverBy = projected !== null && data.budget ? projected - data.budget.totalBudget : 0;

  const statusChip = overBudget
    ? { tone: "neg" as const, label: "Over budget" }
    : offPace
      ? { tone: "neutral" as const, label: "Off pace" }
      : { tone: "good" as const, label: "On track" };

  const topGoal = data.goals[0];
  const topGoalPct = topGoal
    ? Math.min(100, Math.round((Number(topGoal.current_amount) / (Number(topGoal.target_amount) || 1)) * 100))
    : 0;

  return (
    <div className="px-4 pt-4 flex flex-col gap-3.5">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pt-1">
        <div>
          <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground">
            {greeting
              ? `${greeting}${firstName ? `, ${firstName}` : ""}`
              : firstName
                ? `Hi, ${firstName}`
                : "Dashboard"}
          </h1>
          <p className="text-[11px] font-medium text-muted-foreground mt-1">
            Here&apos;s your money at a glance
          </p>
        </div>
        <Link
          href="/profile"
          aria-label="Profile"
          className="flex size-[38px] items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">person</span>
        </Link>
      </div>

      {/* Budget hero (lime) */}
      <div id="dashboard-budget-summary">
        {data.budget ? (
          <div className="relative overflow-hidden rounded-card bg-accent wordmark-watermark p-[18px] text-[var(--accent-ink)]">
            <div className="flex items-start justify-between">
              <span className="text-[11.5px] font-semibold">Left to spend · this month</span>
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-1.5">
                  {month !== null && (
                    <Chip tone="neutral" className="bg-white/40 border-0">
                      {daysLeftLabel(month.daysLeft)}
                    </Chip>
                  )}
                  <Chip tone={statusChip.tone} className="bg-white/60 border-0">
                    {statusChip.label}
                  </Chip>
                </div>
                {isPremium && <CrownBadge size={60} className="absolute top-9" />}
              </div>
            </div>
            <div className="figure text-[44px] leading-[0.92] my-2.5" style={{ color: "var(--accent-ink)" }}>
              <CurrencyText value={data.budget.remaining} />
            </div>
            <div
              id="dashboard-budget-progress"
              className="h-[7px] rounded-full overflow-hidden"
              style={{ background: "color-mix(in srgb, var(--accent-ink) 18%, transparent)" }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${budgetSpentPct}%`, background: "var(--accent-ink)" }}
              />
            </div>
            <div className="flex justify-between mt-2 text-[11px] font-semibold">
              <span><CurrencyText value={data.budget.spent} /> spent</span>
              <span>of <CurrencyText value={data.budget.totalBudget} /></span>
            </div>
            {/* Pace: projected month-end spend at the current daily rate. */}
            {projected !== null && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold opacity-90">
                <span className="material-symbols-outlined text-[14px] leading-none">
                  {offPace || overBudget ? "trending_up" : "check_circle"}
                </span>
                {overBudget ? (
                  <span>Already over — ease up to recover</span>
                ) : offPace ? (
                  <span>
                    On pace for <CurrencyText value={projected} /> · <CurrencyText value={paceOverBy} /> over
                  </span>
                ) : (
                  <span>
                    On pace for <CurrencyText value={projected} /> by month-end
                  </span>
                )}
              </div>
            )}
            <Link
              href="/budget"
              onClick={() => haptic.light()}
              className="mt-3.5 flex h-[46px] items-center justify-center gap-2 rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold active:scale-[0.98] transition-transform"
            >
              Manage budget
            </Link>
          </div>
        ) : (
          <Link
            href="/budget"
            onClick={() => haptic.light()}
            className="block rounded-card bg-accent wordmark-watermark p-[18px] text-[var(--accent-ink)]"
          >
            <div className="text-[11.5px] font-semibold">Budget</div>
            <div className="font-display text-[22px] font-bold mt-1" style={{ color: "var(--accent-ink)" }}>
              Set up your budget
            </div>
            <div className="text-[12px] font-medium mt-1 opacity-80">
              Create a monthly allocation to start tracking. →
            </div>
          </Link>
        )}
      </div>

      {/* Top spending — compact strip of the biggest item spends this month */}
      {data.budget && <TopSpendingGlimpse items={data.items} />}

      {/* Stat pair: Net worth + Goals */}
      <div className="flex gap-3">
        <Link href="/net-worth" className="flex-1" id="dashboard-net-worth-section">
          <StatCard
            icon={<TrendingUp size={16} strokeWidth={2} />}
            chip={
              <Chip tone="onDark">
                {netWorthChange >= 0 ? "▲" : "▼"} {Math.abs(netWorthChange)}%
              </Chip>
            }
            label="Net worth"
            value={<CurrencyText value={currentNetWorth} />}
            className="h-full"
          />
        </Link>

        <Link href="/goals" className="flex-1" id="dashboard-goals-card" onClick={() => haptic.light()}>
          <StatCard
            icon={<span className="text-[16px] leading-none">{topGoal?.icon || "🎯"}</span>}
            chip={<Chip tone="good">{data.goals.length} active</Chip>}
            label="Goals"
            value={
              topGoal ? (
                <span className="text-[14px] font-bold leading-tight line-clamp-1">{topGoal.name}</span>
              ) : (
                <span className="text-[14px] font-bold">None yet</span>
              )
            }
            footer={
              topGoal ? (
                <>
                  <div className="h-1.5 rounded-full bg-[var(--progress-empty)] overflow-hidden mt-2">
                    <div className="h-full rounded-full bg-accent-strong" style={{ width: `${topGoalPct}%` }} />
                  </div>
                  <div className="text-[10px] font-semibold text-muted-foreground mt-1.5 tabular-nums">
                    <CurrencyText value={Number(topGoal.current_amount)} /> of{" "}
                    <CurrencyText value={Number(topGoal.target_amount)} />
                  </div>
                </>
              ) : (
                <div className="text-[10px] font-semibold text-muted-foreground mt-1.5">Tap to add a goal</div>
              )
            }
            className="h-full"
          />
        </Link>
      </div>

      {/* Quick Log */}
      {data.budget && data.categories.length > 0 && (
        <Card id="dashboard-quick-spend">
          <QuickSpendInput categories={data.categories} />
        </Card>
      )}
    </div>
  );
}
