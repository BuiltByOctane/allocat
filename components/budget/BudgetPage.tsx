"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Drawer } from "vaul";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Receipt } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useRegisterQuickAction } from "@/lib/providers/QuickActionProvider";
import QuickSpendInput from "@/components/dashboard/QuickSpendInput";
import { useAddBudgetCategory, useUpdateBudgetTotal, budgetKey } from "@/lib/hooks/useBudget";
import { DASHBOARD_KEY } from "@/lib/hooks/useDashboard";
import { BottomSheetSelect } from "@/components/ui/BottomSheetSelect";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { InlineEditableNumber } from "@/components/ui/InlineEditableNumber";
import { Progress } from "@/components/ui/Progress";
import { Card } from "@/components/ui/Card";
import { resolveColor } from "@/lib/theme/dataViz";
import BudgetEmptyState from "@/components/budget/BudgetEmptyState";
import { BudgetSetupSheet } from "@/components/budget/BudgetSetupSheet";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface CategoryData {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  type: string;
  allocated: number;
  spent: number;
  subtitle: string;
}

interface BudgetData {
  id: string;
  month: number;
  year: number;
  totalBudget: number;
  categories: CategoryData[];
}

interface BudgetPageProps {
  data: BudgetData;
  defaultMonth: number;
  defaultYear: number;
}

export default function BudgetPage({ data, defaultMonth, defaultYear }: BudgetPageProps) {
  const router = useRouter();
  const haptic = useHaptic();
  const qc = useQueryClient();
  const addCategoryMutation = useAddBudgetCategory();
  const updateBudgetTotalMutation = useUpdateBudgetTotal();
  const addCategoryInputRef = useRef<HTMLInputElement>(null);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [spendOpen, setSpendOpen] = useState(false);

  // Quick-action dock: log an expense against a budget item (when categories exist).
  const openSpend = useCallback(() => setSpendOpen(true), []);
  useRegisterQuickAction(
    data.categories.length > 0
      ? { id: "budget", label: "Log expense", icon: Receipt, onTrigger: openSpend }
      : null,
  );

  const totalAllocated = data.categories.reduce((s, c) => s + c.allocated, 0);
  const totalSpent = data.categories.reduce((s, c) => s + c.spent, 0);
  const leftOfBudget = data.totalBudget - totalSpent;
  const overspent = leftOfBudget < 0;
  const unallocatedBudget = data.totalBudget - totalAllocated;
  const spentPct = data.totalBudget > 0 ? Math.round((totalSpent / data.totalBudget) * 100) : 0;

  function handleMonthChange(newMonthIndex: number) {
    router.push(`?month=${newMonthIndex + 1}&year=${defaultYear}`);
  }

  useEffect(() => {
    if (!isAddCategoryOpen) return;
    const timer = window.setTimeout(() => addCategoryInputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [isAddCategoryOpen]);

  function openAddCategory() {
    addCategoryMutation.reset();
    haptic.light();
    setIsAddCategoryOpen(true);
  }

  function handleUpdateBudget(totalAmount: number) {
    updateBudgetTotalMutation.mutate({
      budgetId: data.id,
      totalAmount,
      month: defaultMonth,
      year: defaultYear,
    });
  }

  async function handleCreateCategory(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const name = newCategoryName.trim();
    if (!name || addCategoryMutation.isPending) return;
    try {
      const category = await addCategoryMutation.mutateAsync({
        budgetId: data.id,
        name,
        month: defaultMonth,
        year: defaultYear,
      });
      haptic.success();
      setIsAddCategoryOpen(false);
      setNewCategoryName("");
      router.push(`/budget/${category.id}`);
    } catch {
      haptic.error();
    }
  }

  const addCategoryError = addCategoryMutation.isError
    ? addCategoryMutation.error instanceof Error
      ? addCategoryMutation.error.message
      : "Couldn't create the category right now."
    : null;

  const budgetTotalError = updateBudgetTotalMutation.isError
    ? updateBudgetTotalMutation.error instanceof Error
      ? updateBudgetTotalMutation.error.message
      : "Couldn't update the total budget right now."
    : null;

  return (
    <>
      <div className="px-4 pt-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between px-1 pt-1">
          <div>
            <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground">
              Budget
            </h1>
            <p className="text-[11px] font-medium text-muted-foreground mt-1">
              {data.categories.length} {data.categories.length === 1 ? "category" : "categories"}
            </p>
          </div>
          <BottomSheetSelect
            title="Select Month"
            options={MONTHS.map((m, i) => ({ value: String(i), label: `${m} ${defaultYear}` }))}
            value={String(defaultMonth - 1)}
            onChange={(val) => handleMonthChange(Number(val))}
            className="flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-[12px] font-bold text-foreground"
          />
        </div>

        {/* Summary card */}
        <Card id="budget-hero-section">
          <div id="budget-spend-meter">
            <div className="flex justify-between items-end">
              <div>
                <span className="t-label text-muted-foreground">{overspent ? "Over" : "Left"}</span>
                <div
                  className="figure text-[32px] mt-1"
                  style={{ color: overspent ? "var(--neg)" : "var(--foreground)" }}
                >
                  <CurrencyText value={Math.abs(leftOfBudget)} />
                </div>
              </div>
              <div className="text-right">
                <span className="t-label text-muted-foreground">Budget</span>
                <div className="figure text-[16px] mt-1 text-foreground">
                  <InlineEditableNumber value={data.totalBudget} onSave={handleUpdateBudget} />
                </div>
              </div>
            </div>
            {budgetTotalError && (
              <p className="mt-2 text-[11px] text-neg text-right">{budgetTotalError}</p>
            )}
            <div id="budget-tick-ruler" className="mt-3.5">
              <Progress value={Math.min(spentPct, 100)} state={overspent ? "over" : "normal"} />
            </div>
            <div className="text-[11px] font-semibold text-muted-foreground mt-2.5">
              {spentPct}% used ·{" "}
              <span className="text-foreground">
                <CurrencyText value={totalSpent} /> spent
              </span>
            </div>
            {unallocatedBudget !== 0 && (
              <div
                className={`text-[11px] font-semibold mt-1 ${
                  unallocatedBudget < 0 ? "text-neg" : "text-muted-foreground"
                }`}
              >
                <CurrencyText value={Math.abs(unallocatedBudget)} />{" "}
                {unallocatedBudget < 0 ? "over-allocated" : "not allocated yet"}
              </div>
            )}
          </div>
        </Card>

        {/* Categories header */}
        <div id="budget-categories-header" className="flex items-center justify-between px-1 mt-1">
          <span className="font-display text-[15px] font-bold text-foreground">
            Categories · {data.categories.length}
          </span>
          <div className="flex items-center gap-4">
            {data.categories.length === 0 && (
              <button
                type="button"
                onClick={() => { haptic.light(); setIsSetupOpen(true); }}
                className="text-[13px] font-bold text-muted-foreground"
              >
                Template
              </button>
            )}
            <button
              id="add-category-inline"
              type="button"
              onClick={openAddCategory}
              className="flex items-center gap-1 text-[13px] font-bold text-foreground"
            >
              <span className="text-accent-strong text-base leading-none">＋</span>New
            </button>
          </div>
        </div>

        {/* Category list */}
        {data.categories.length === 0 ? (
          <BudgetEmptyState
            onSetup={() => { haptic.light(); setIsSetupOpen(true); }}
            onAddCategory={openAddCategory}
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {data.categories.map((cat, i) => {
              const pct = cat.allocated > 0 ? cat.spent / cat.allocated : 0;
              const isOver = cat.spent > cat.allocated && cat.allocated > 0;
              const isPending = cat.id.startsWith("temp_");
              return (
                <Link
                  key={cat.id}
                  id={i === 0 ? "budget-category-row-0" : undefined}
                  href={isPending ? "#" : `/budget/${cat.id}`}
                  onClick={(e) => {
                    if (isPending) { e.preventDefault(); haptic.error(); return; }
                    haptic.selection();
                  }}
                  aria-disabled={isPending}
                  className={`block active:scale-[0.99] transition-transform ${isPending ? "opacity-60 cursor-progress" : ""}`}
                >
                  <Card compact className="flex items-center gap-3">
                    <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-tile text-[17px]">
                      {cat.icon || "📁"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-[14px] font-bold text-foreground truncate">
                          {cat.name}
                          <span className="text-[11px] font-medium text-muted-foreground"> · {cat.subtitle}</span>
                        </span>
                        <span className="figure text-[13px] shrink-0">
                          <span style={{ color: isOver ? "var(--neg)" : "var(--foreground)" }}>
                            <CurrencyText value={cat.spent} />
                          </span>
                          <span className="text-muted-foreground"> / <CurrencyText value={cat.allocated} /></span>
                        </span>
                      </div>
                      <Progress
                        className="mt-2 h-1.5"
                        value={Math.min(pct, 1) * 100}
                        state={isOver ? "over" : "normal"}
                        color={isOver ? undefined : resolveColor({ id: cat.id, color: cat.color })}
                      />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      
      <BudgetSetupSheet
        isOpen={isSetupOpen}
        onClose={() => setIsSetupOpen(false)}
        budgetId={data.id}
        existingTotalBudget={data.totalBudget}
        onDone={() => {
          qc.invalidateQueries({ queryKey: budgetKey(defaultMonth, defaultYear) });
          qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
        }}
      />

      <Drawer.Root
        open={isAddCategoryOpen}
        onOpenChange={(open) => {
          setIsAddCategoryOpen(open);
          if (!open) {
            addCategoryMutation.reset();
            setNewCategoryName("");
          }
        }}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Drawer.Content
            aria-describedby="add-category-description"
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card focus:outline-none sheet-3q"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-9 h-1 bg-border rounded-full" />
            </div>

            <div className="px-6 py-4">
              <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground">
                Add category
              </Drawer.Title>
              <p id="add-category-description" className="mt-1 text-[13px] text-muted-foreground">
                Start with a name. Set the icon, allocation, and items after.
              </p>
            </div>

            <form onSubmit={handleCreateCategory} className="px-6 py-2 space-y-4 pb-10">
              <div className="space-y-2">
                <label
                  htmlFor="new-category-name"
                  className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground"
                >
                  Category name
                </label>
                <input
                  ref={addCategoryInputRef}
                  id="new-category-name"
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Groceries"
                  className="w-full bg-card border border-border rounded-[13px] px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
                />
              </div>

              {addCategoryMutation.isError && (
                <p className="text-[11px] font-medium text-neg">{addCategoryError}</p>
              )}

              <div className="flex flex-col gap-3">
                <button
                  type="submit"
                  disabled={!newCategoryName.trim() || addCategoryMutation.isPending}
                  className="w-full h-[48px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                >
                  {addCategoryMutation.isPending ? "Creating..." : "Create category"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddCategoryOpen(false)}
                  className="w-full h-[48px] rounded-pill bg-muted text-foreground text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Quick-log expense sheet (opened from the dock button) */}
      <Drawer.Root open={spendOpen} onOpenChange={setSpendOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Drawer.Content
            aria-describedby="quick-spend-description"
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card focus:outline-none sheet-3q"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-9 h-1 bg-border rounded-full" />
            </div>
            <Drawer.Title className="sr-only">Log expense</Drawer.Title>
            <p id="quick-spend-description" className="sr-only">
              Pick a category and item, then enter an amount to log a spend.
            </p>
            <div className="overflow-y-auto flex-1 px-6 pt-2 pb-8">
              <QuickSpendInput categories={data.categories} />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
