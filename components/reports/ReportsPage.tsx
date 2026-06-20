"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getDB } from "@/lib/db";
import { getBudgetFromIDB } from "@/lib/hooks/useBudget";
import { getBudgetForPeriod } from "@/lib/actions/budget";
import { useMonthlyReport, useSaveReportNotes } from "@/lib/hooks/useReports";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { Card } from "@/components/ui/Card";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { Progress } from "@/components/ui/Progress";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface CategorySummary {
  id: string;
  name: string;
  icon: string | null;
  allocated: number;
  spent: number;
}

interface MerchantSummary {
  label: string;
  amount: number;
}

interface MonthSummary {
  budgetId: string | null;
  totalBudget: number;
  totalAllocated: number;
  totalSpent: number;
  categories: CategorySummary[];
  topMerchants: MerchantSummary[];
}

function summaryKey(month: number, year: number) {
  return ["report-summary", month, year] as const;
}

/** Compute the month summary from IDB (budget + categories + items + SMS spend). */
async function computeSummary(month: number, year: number): Promise<MonthSummary> {
  let budget = await getBudgetFromIDB(month, year);
  if (!budget) {
    // IDB miss (new month / first open) — server creates + returns the budget.
    try {
      budget = await getBudgetForPeriod(month, year);
    } catch {
      budget = null;
    }
  }

  const db = getDB();

  const categories: CategorySummary[] = budget
    ? budget.categories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon ?? null,
        allocated: Number(c.allocated),
        spent: Number(c.spent),
      }))
    : [];

  const totalAllocated = categories.reduce((s, c) => s + c.allocated, 0);
  const totalSpent = categories.reduce((s, c) => s + c.spent, 0);

  // Top spends from categorized transactions that occurred in this month.
  const txns = await db.sms_transactions
    .where("status")
    .equals("categorized")
    .toArray();

  const merchantTotals = new Map<string, number>();
  for (const t of txns) {
    if (t.direction === "credit") continue;
    const when = t.occurred_at ?? t.created_at;
    if (!when) continue;
    const d = new Date(when);
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
    const amount = Number(t.amount ?? 0);
    if (!amount) continue;
    const label =
      t.label ||
      t.merchant_normalized ||
      t.merchant_raw ||
      "Other";
    merchantTotals.set(label, (merchantTotals.get(label) ?? 0) + amount);
  }

  const topMerchants: MerchantSummary[] = [...merchantTotals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return {
    budgetId: budget?.id ?? null,
    totalBudget: budget ? Number(budget.totalBudget) : 0,
    totalAllocated,
    totalSpent,
    categories: categories.sort((a, b) => b.spent - a.spent),
    topMerchants,
  };
}

export default function ReportsPage() {
  const router = useRouter();
  const haptic = useHaptic();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data: summary, isLoading } = useQuery({
    queryKey: summaryKey(month, year),
    queryFn: () => computeSummary(month, year),
  });

  const { data: report } = useMonthlyReport(month, year);
  const saveNotes = useSaveReportNotes();

  const [notes, setNotes] = useState("");
  const [savedHint, setSavedHint] = useState(false);

  // Sync the textarea with the loaded note when navigating between months or
  // when the saved note resolves. Render-time reconciliation (vs. an effect)
  // keeps the field in step without an extra paint.
  const periodSig = `${month}-${year}`;
  const [prevPeriodSig, setPrevPeriodSig] = useState(periodSig);
  const [prevNote, setPrevNote] = useState(report?.notes ?? "");
  const loadedNote = report?.notes ?? "";
  if (periodSig !== prevPeriodSig || loadedNote !== prevNote) {
    setPrevPeriodSig(periodSig);
    setPrevNote(loadedNote);
    setNotes(loadedNote);
    setSavedHint(false);
  }

  const monthLabel = useMemo(
    () => `${MONTH_NAMES[month - 1]} ${year}`,
    [month, year],
  );

  function shiftMonth(delta: number) {
    haptic.light();
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m);
    setYear(y);
  }

  async function handleSave() {
    if (!summary?.budgetId) return;
    haptic.success();
    await saveNotes.mutateAsync({
      budgetId: summary.budgetId,
      month,
      year,
      notes: notes.trim(),
    });
    setSavedHint(true);
    setTimeout(() => setSavedHint(false), 2000);
  }

  const maxCatValue = Math.max(
    1,
    ...(summary?.categories.map((c) => Math.max(c.allocated, c.spent)) ?? [1]),
  );

  const remaining = (summary?.totalBudget ?? 0) - (summary?.totalSpent ?? 0);

  return (
    <div className="px-4 pt-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 px-1 pt-1">
        <button
          onClick={() => { haptic.light(); router.back(); }}
          aria-label="Back"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        </button>
        <div>
          <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground">
            Monthly report
          </h1>
          <p className="text-[11px] font-medium text-muted-foreground mt-1">
            Spending recap &amp; notes
          </p>
        </div>
      </div>

      {/* Month picker */}
      <div className="flex items-center justify-between rounded-card border border-border bg-card px-2 py-2">
        <button
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground transition-colors active:scale-95"
        >
          <span className="material-symbols-outlined text-[20px]">chevron_left</span>
        </button>
        <span className="font-display text-[15px] font-bold text-foreground">
          {monthLabel}
        </span>
        <button
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground transition-colors active:scale-95"
        >
          <span className="material-symbols-outlined text-[20px]">chevron_right</span>
        </button>
      </div>

      {isLoading ? (
        <Card>
          <p className="py-6 text-center text-[12px] font-medium text-muted-foreground">
            Loading…
          </p>
        </Card>
      ) : (
        <>
          {/* Top stats */}
          <div className="grid grid-cols-2 gap-2.5">
            <Card compact>
              <div className="t-label text-muted-foreground">Spent</div>
              <div className="figure text-[22px] mt-1 text-foreground">
                <CurrencyText value={summary?.totalSpent ?? 0} />
              </div>
            </Card>
            <Card compact>
              <div className="t-label text-muted-foreground">Budget</div>
              <div className="figure text-[22px] mt-1 text-foreground">
                <CurrencyText value={summary?.totalBudget ?? 0} />
              </div>
            </Card>
            <Card compact>
              <div className="t-label text-muted-foreground">Allocated</div>
              <div className="figure text-[18px] mt-1 text-foreground">
                <CurrencyText value={summary?.totalAllocated ?? 0} />
              </div>
            </Card>
            <Card compact>
              <div className="t-label text-muted-foreground">
                {remaining >= 0 ? "Left" : "Over"}
              </div>
              <div className={`figure text-[18px] mt-1 ${remaining >= 0 ? "text-foreground" : "text-neg"}`}>
                <CurrencyText value={Math.abs(remaining)} />
              </div>
            </Card>
          </div>

          {/* By category */}
          <div className="px-1 mt-1">
            <span className="font-display text-[15px] font-bold text-foreground">
              By category · {summary?.categories.length ?? 0}
            </span>
          </div>
          {(summary?.categories.length ?? 0) === 0 ? (
            <Card compact>
              <p className="py-4 text-center text-[12px] font-medium text-muted-foreground">
                No budget categories this month.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2.5">
              {summary!.categories.map((c) => {
                const pct = c.allocated > 0 ? (c.spent / c.allocated) * 100 : 0;
                return (
                  <Card key={c.id} compact>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {c.icon && <span className="text-sm leading-none">{c.icon}</span>}
                        <span className="text-[13.5px] font-bold text-foreground truncate">
                          {c.name}
                        </span>
                      </div>
                      <div className="figure text-[13px] inline-flex items-baseline gap-1 shrink-0">
                        <CurrencyText value={c.spent} className="text-foreground" />
                        <span className="text-muted-foreground text-[11px] inline-flex items-baseline gap-0.5">
                          / <CurrencyText value={c.allocated} className="text-muted-foreground" />
                        </span>
                      </div>
                    </div>
                    {/* Allocation vs spend bar (relative to the largest of the two). */}
                    <div className="mt-2 flex flex-col gap-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-tile">
                        <div
                          className="h-full rounded-full bg-border"
                          style={{ width: `${Math.min(100, (c.allocated / maxCatValue) * 100)}%` }}
                        />
                      </div>
                      <Progress
                        className="h-1.5"
                        value={Math.min(100, pct)}
                        color={pct > 100 ? "var(--neg)" : undefined}
                      />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Top spends */}
          {(summary?.topMerchants.length ?? 0) > 0 && (
            <>
              <div className="px-1 mt-1">
                <span className="font-display text-[15px] font-bold text-foreground">
                  Top spends
                </span>
              </div>
              <Card compact>
                <div className="flex flex-col divide-y divide-border">
                  {summary!.topMerchants.map((m) => (
                    <div key={m.label} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                      <span className="text-[13px] font-semibold text-foreground truncate">
                        {m.label}
                      </span>
                      <span className="figure text-[13px] text-foreground shrink-0">
                        <CurrencyText value={m.amount} />
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {/* Notes */}
          <div className="px-1 mt-1">
            <span className="font-display text-[15px] font-bold text-foreground">Notes</span>
          </div>
          <Card>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did this month go? Anything to remember…"
              rows={4}
              className="w-full resize-none bg-transparent text-[13.5px] font-medium text-foreground placeholder:text-muted-foreground outline-none"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] font-medium text-muted-foreground">
                {savedHint ? "Saved ✓" : ""}
              </span>
              <button
                onClick={handleSave}
                disabled={!summary?.budgetId || saveNotes.isPending}
                className="rounded-pill bg-[var(--pill)] px-5 h-[40px] text-[13px] font-bold text-[var(--pill-foreground)] disabled:opacity-40 active:scale-[0.98] transition-all"
              >
                {saveNotes.isPending ? "Saving…" : "Save notes"}
              </button>
            </div>
          </Card>
        </>
      )}

      <div className="h-28 md:h-12" />
    </div>
  );
}
