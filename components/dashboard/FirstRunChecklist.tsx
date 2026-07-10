"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getDB } from "@/lib/db";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import type { DashboardEmptySource } from "@/lib/utils/dashboard-empty";

const DISMISS_KEY = "allocat-firstrun-dismissed";

export interface FirstRunItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
  /** Highlight the primary first action (budget). */
  primary?: boolean;
}

export interface FirstRunState {
  /** Show the guide instead of the dashboard. */
  visible: boolean;
  items: FirstRunItem[];
  doneCount: number;
  dismiss: () => void;
}

/**
 * Owns the "Set up your money" guide's visibility + progress. Lives in a hook so
 * the dashboard page can render the guide in place of the dashboard (rather than
 * stacked above it) and flip to the dashboard the moment it's dismissed or every
 * step is done. Debt isn't in the dashboard payload, so its count is read from IDB.
 */
export function useFirstRun(
  data: DashboardEmptySource | null | undefined
): FirstRunState {
  const [dismissed, setDismissed] = useState(false);
  const [hasDebt, setHasDebt] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Read persisted state after mount so SSR and the first client render agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  useEffect(() => {
    let active = true;
    getDB()
      .debts.count()
      .then((n) => {
        if (active) setHasDebt(n > 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const budgetDone =
    !!data?.budget &&
    (Number(data.budget.totalBudget) > 0 || (data.categories?.length ?? 0) > 0);
  const assetDone = (data?.netWorthHistory.length ?? 0) > 0;
  const goalDone = (data?.goals.length ?? 0) > 0;

  const items: FirstRunItem[] = [
    {
      id: "budget",
      icon: "account_balance_wallet",
      title: "Set up your budget",
      description: "Pick a template or add categories - your spending plan.",
      href: "/budget",
      done: budgetDone,
      primary: true,
    },
    {
      id: "asset",
      icon: "savings",
      title: "Add an asset",
      description: "Bank balance, cash, or investments you hold.",
      href: "/net-worth",
      done: assetDone,
    },
    {
      id: "debt",
      icon: "credit_card",
      title: "Track a debt or a loan you gave",
      description: "Money you owe, or money someone owes you.",
      href: "/debt",
      done: hasDebt,
    },
    {
      id: "goal",
      icon: "flag",
      title: "Set a savings goal",
      description: "Something you're putting money aside for.",
      href: "/goals",
      done: goalDone,
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  function dismiss() {
    if (typeof window !== "undefined")
      window.localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return { visible: !dismissed && !allDone, items, doneCount, dismiss };
}

/**
 * Presentational "Set up your money" card. Visibility/progress come from
 * useFirstRun() so the page decides whether to render it.
 */
export default function FirstRunChecklist({
  items,
  doneCount,
  onDismiss,
}: {
  items: FirstRunItem[];
  doneCount: number;
  onDismiss: () => void;
}) {
  const haptic = useHaptic();

  function handleDismiss() {
    haptic.light();
    onDismiss();
  }

  return (
    <div className="mt-8 rounded-card bg-card border border-border overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="font-display text-[19px] font-bold tracking-[-0.02em] text-foreground">
            Set up your money
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            A few quick steps to make AlloCat yours.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss setup guide"
          className="shrink-0 -mr-1 -mt-1 flex size-8 items-center justify-center rounded-full text-muted-foreground active:scale-95 transition"
        >
          <MaterialSymbol icon="close" className="text-[20px]" />
        </button>
      </div>

      <div className="px-5 pt-4">
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-tile overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${(doneCount / items.length) * 100}%` }}
            />
          </div>
          <span className="text-[11px] font-bold tabular-nums text-muted-foreground">
            {doneCount}/{items.length}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            onClick={() => haptic.selection()}
            className={`flex items-center gap-3 rounded-[14px] border p-3 transition active:scale-[0.99] ${
              item.done
                ? "border-border bg-tile/40 opacity-70"
                : item.primary
                  ? "border-transparent bg-accent/10 ring-1 ring-[var(--accent-strong)]/40"
                  : "border-border bg-card active:bg-tile/50"
            }`}
          >
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-[12px] ${
                item.done
                  ? "bg-accent text-[var(--accent-ink)]"
                  : "bg-tile text-foreground"
              }`}
            >
              <MaterialSymbol
                icon={item.done ? "check" : item.icon}
                className="text-[22px]"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`text-[14px] font-bold text-foreground ${
                  item.done ? "line-through decoration-muted-foreground/50" : ""
                }`}
              >
                {item.title}
              </p>
              <p className="text-[12px] text-muted-foreground leading-snug">
                {item.description}
              </p>
            </div>
            {!item.done && (
              <MaterialSymbol
                icon="chevron_right"
                className="shrink-0 text-[22px] text-muted-foreground"
              />
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
