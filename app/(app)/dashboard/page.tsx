"use client";

import DashboardPage from "@/components/dashboard/DashboardPage";
import FirstRunChecklist, { useFirstRun } from "@/components/dashboard/FirstRunChecklist";
import Link from "next/link";
import { useDashboardData } from "@/lib/hooks/useDashboard";
import AIOverlay from "@/components/ai/AIOverlay";
import { useTour } from "@/lib/tour/useTour";
import { useTourDriver } from "@/lib/tour/useTourDriver";
import { mockDashboardData } from "@/lib/tour/mockData";

function DashboardSkeleton() {
  return (
    <div className="animate-pulse px-4 py-8 space-y-6">
      <div className="flex items-center justify-between px-2 mb-10">
        <div className="h-6 bg-muted rounded w-24" />
        <div className="size-10 bg-muted rounded-full" />
      </div>
      <div className="bg-card rounded-xl p-6 border border-border space-y-4">
        <div className="h-3 bg-muted rounded w-1/4" />
        <div className="h-10 bg-muted rounded w-1/2" />
        <div className="h-2 bg-muted rounded w-full" />
      </div>
      <div className="space-y-3">
        <div className="h-4 bg-muted rounded w-1/4 mb-4" />
        <div className="h-36 bg-card rounded-xl border border-border w-full" />
      </div>
      <div className="space-y-3">
        <div className="h-4 bg-muted rounded w-1/4 mb-4" />
        <div className="h-20 bg-card rounded-xl border border-border w-full" />
        <div className="h-20 bg-card rounded-xl border border-border w-full" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, isError } = useDashboardData();
  const tour = useTour();
  const tourActive = tour.isPageTourActive("dashboard");
  useTourDriver("dashboard");
  const firstRun = useFirstRun(data);

  if (isLoading && !tourActive) return <DashboardSkeleton />;

  if (isError || (!data && !tourActive)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 px-6">
        <p className="text-sm text-muted-foreground">Failed to load dashboard</p>
      </div>
    );
  }

  const displayData = tourActive ? mockDashboardData : data!;

  // While the setup guide is active, show ONLY the guide (not the dashboard
  // underneath) until the user finishes every step or dismisses it.
  if (!tourActive && firstRun.visible) {
    return (
      <div className="px-6">
        <header className="flex items-center justify-between pt-10 pb-4">
          <h1 className="text-xl font-bold tracking-tight text-foreground">AlloCat</h1>
          <Link
            href="/profile"
            className="flex items-center justify-center size-10 rounded-full bg-muted"
          >
            <span className="material-symbols-outlined text-[22px]">account_circle</span>
          </Link>
        </header>
        <FirstRunChecklist
          items={firstRun.items}
          doneCount={firstRun.doneCount}
          onDismiss={firstRun.dismiss}
        />
        <AIOverlay />
      </div>
    );
  }

  return (
    <>
      <DashboardPage data={displayData} />
      <AIOverlay />
    </>
  );
}
