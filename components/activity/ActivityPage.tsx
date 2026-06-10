"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, History } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import ActivityLogItem from "./ActivityLogItem";
import ActivityDetailSheet from "./ActivityDetailSheet";
import {
  useActivityLogs,
  groupLogsByDate,
  type ActivityFilter,
  type SelectedMonth,
} from "@/lib/hooks/useActivityLogs";
import type { ActivityLogRow } from "@/lib/db";

type CategoryChip = ActivityFilter["category"];

const CATEGORY_CHIPS: { label: string; value: CategoryChip }[] = [
  { label: "All", value: "all" },
  { label: "Budget", value: "budget" },
  { label: "Net Worth", value: "net_worth" },
  { label: "Goals", value: "goals" },
  { label: "Debts", value: "debts" },
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthLabel(m: SelectedMonth) {
  return `${MONTH_NAMES[m.month]} ${m.year}`;
}

function monthKey(m: SelectedMonth) {
  return `${m.year}-${m.month}`;
}

interface ActivityPageProps {
  overrideLogs?: ActivityLogRow[];
}

export default function ActivityPage({ overrideLogs }: ActivityPageProps) {
  const [filter, setFilter] = useState<ActivityFilter>({
    category: "all",
    selectedMonth: null,
  });
  const [selectedLog, setSelectedLog] = useState<ActivityLogRow | null>(null);

  const { data: fetchedLogs, isLoading, availableMonths } = useActivityLogs(filter);
  const logs = overrideLogs ?? fetchedLogs;
  const groups = groupLogsByDate(logs);

  return (
    <div className="px-4 pt-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 px-1 pt-1">
        <Link
          href="/profile"
          aria-label="Back"
          className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-foreground"
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </Link>
        <div>
          <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground">
            Activity
          </h1>
          <p className="text-[11px] font-medium text-muted-foreground mt-1">Action history</p>
        </div>
      </div>

      <div className="space-y-2">
        <div id="activity-category-chips">
          <SegmentedControl
            variant="pill"
            scroll
            options={CATEGORY_CHIPS}
            value={filter.category}
            onChange={(category) => setFilter((f) => ({ ...f, category }))}
          />
        </div>

        {availableMonths.length > 0 && (
          <SegmentedControl
            variant="pill"
            scroll
            options={[
              { label: "All Time", value: "__all__" },
              ...availableMonths.map((m) => ({ label: monthLabel(m), value: monthKey(m) })),
            ]}
            value={filter.selectedMonth ? monthKey(filter.selectedMonth) : "__all__"}
            onChange={(v) =>
              setFilter((f) => ({
                ...f,
                selectedMonth:
                  v === "__all__"
                    ? null
                    : availableMonths.find((m) => monthKey(m) === v) ?? null,
              }))
            }
          />
        )}
      </div>

      <div id="activity-log-list" className="pt-2 space-y-5">
        {isLoading && (
          <div className="space-y-2.5">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-[64px] bg-muted/50 animate-pulse rounded-card"
              />
            ))}
          </div>
        )}

        {!isLoading && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex size-12 items-center justify-center rounded-[14px] bg-tile text-muted-foreground mb-4">
              <History size={24} strokeWidth={1.7} />
            </div>
            <p className="font-bold text-foreground">No activity yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Actions you take will appear here
            </p>
          </div>
        )}

        {groups.map(({ label, items }, gi) => (
          <div key={label} id={gi === 0 ? "activity-first-group" : undefined}>
            <p className="t-label text-muted-foreground mb-2 ml-1">
              {label}
            </p>
            <div className="space-y-2.5">
              {items.map((log, li) => (
                <div key={log.id} id={gi === 0 && li === 0 ? "activity-first-item" : undefined}>
                  <ActivityLogItem
                    log={log}
                    onClick={() => setSelectedLog(log)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>


      <ActivityDetailSheet
        log={selectedLog}
        open={selectedLog !== null}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
}
