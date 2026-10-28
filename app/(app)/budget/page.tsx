"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BudgetPage, { type BudgetCreateIntent } from "@/components/budget/BudgetPage";
import { useStartDayGate } from "@/components/budget/useStartDayGate";
import { useBudgetData } from "@/lib/hooks/useBudget";
import { useTour } from "@/lib/tour/useTour";
import { useTourDriver } from "@/lib/tour/useTourDriver";
import { mockBudgetData } from "@/lib/tour/mockData";
import { useCurrentPeriod } from "@/lib/hooks/useCurrentPeriod";
import { useSync } from "@/lib/hooks/useSync";
import { getStartDayIDB, getStoredPeriodsIDB } from "@/lib/budget/periodIDB";
import { findCoveringBudget, rangeForLabel } from "@/lib/budget/period";

function BudgetSkeleton() {
  return (
    <div className="animate-pulse px-4 py-8 space-y-6">
      <div className="flex items-center justify-between px-2 mb-6">
        <div className="space-y-1">
          <div className="h-6 bg-muted rounded w-20" />
          <div className="h-3 bg-muted rounded w-32" />
        </div>
        <div className="size-10 bg-muted rounded-full" />
      </div>
      <div className="h-14 bg-card rounded-xl border border-border w-full" />
      <div className="grid grid-cols-3 border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-r border-border space-y-2">
          <div className="h-2 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-full" />
        </div>
        <div className="p-4 border-r border-border space-y-2">
          <div className="h-2 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-full" />
        </div>
        <div className="p-4 space-y-2">
          <div className="h-2 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-full" />
        </div>
      </div>
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-between">
              <div className="h-4 bg-muted rounded w-20" />
              <div className="h-4 bg-muted rounded w-16" />
            </div>
            <div className="h-1.5 bg-muted rounded-full w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function BudgetContent() {
  const searchParams = useSearchParams();
  const tour = useTour();
  const tourActive = tour.isPageTourActive("budget");
  useTourDriver("budget");

  const router = useRouter();
  const { isHydrated } = useSync();
  // Held here, not in BudgetPage: picking a start day can change the current
  // label, which shows the skeleton and re-mounts BudgetPage — the picker and
  // the gated action must survive that.
  const startDayGate = useStartDayGate<BudgetCreateIntent>();
  // Default = the budget cycle containing today (the same label prefetch
  // warmed), not the calendar month.
  const { period: current, isLoading: periodLoading } = useCurrentPeriod();

  const monthParam = searchParams.get("month");
  const yearParam = searchParams.get("year");
  const hasParams = !!monthParam && !!yearParam;

  const selectedMonth = monthParam ? parseInt(monthParam, 10) : current.month;
  const selectedYear = yearParam ? parseInt(yearParam, 10) : current.year;

  // An absorbed label (its computed range sits inside a stored budget with
  // another label, e.g. November after October was stretched to Nov 30) has
  // no cycle of its own — show the budget that covers it instead.
  useEffect(() => {
    if (!hasParams || !isHydrated) return;
    let cancelled = false;
    void (async () => {
      const [budgets, startDay] = await Promise.all([getStoredPeriodsIDB(), getStartDayIDB()]);
      if (cancelled) return;
      const range = rangeForLabel({ month: selectedMonth, year: selectedYear }, budgets, startDay);
      const cover = findCoveringBudget(range, budgets);
      if (cover) router.replace(`/budget?month=${cover.month}&year=${cover.year}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasParams, isHydrated, selectedMonth, selectedYear, router]);

  const waitForPeriod = !hasParams && periodLoading;
  const { data, isLoading, isError } = useBudgetData(selectedMonth, selectedYear, {
    enabled: !waitForPeriod,
  });

  // Without a URL label, wait for the resolved cycle so the calendar-month
  // fallback never fetches (and flashes) the wrong budget.
  if (waitForPeriod && !tourActive) return <><BudgetSkeleton />{startDayGate.sheet}</>;
  if (isLoading && !tourActive) return <><BudgetSkeleton />{startDayGate.sheet}</>;

  if (isError || (!data && !tourActive)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 px-6">
        <p className="text-sm text-muted-foreground">Failed to load budget</p>
      </div>
    );
  }

  const displayData = tourActive
    ? { ...mockBudgetData, month: selectedMonth, year: selectedYear }
    : data!;

  return (
    <>
      <BudgetPage
        data={displayData}
        defaultMonth={selectedMonth}
        defaultYear={selectedYear}
        startDayGate={startDayGate}
      />
      {startDayGate.sheet}
    </>
  );
}

export default function Budget() {
  return (
    <Suspense fallback={<BudgetSkeleton />}>
      <BudgetContent />
    </Suspense>
  );
}
