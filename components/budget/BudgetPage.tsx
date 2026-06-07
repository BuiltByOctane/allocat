"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Drawer } from "vaul";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useAddBudgetCategory, useUpdateBudgetTotal, budgetKey } from "@/lib/hooks/useBudget";
import { DASHBOARD_KEY } from "@/lib/hooks/useDashboard";
import { BottomSheetSelect } from "@/components/ui/BottomSheetSelect";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { InlineEditableNumber } from "@/components/ui/InlineEditableNumber";
import { Progress } from "@/components/ui/Progress";
import { resolveColor, softText, tintSurface } from "@/lib/theme/dataViz";
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

// Thin wrappers over the shared <Progress/> primitive — preserve each call
// site's spacing + input convention (TickRuler takes 0–100, SegBar takes 0–1).
function TickRuler({ pct }: { pct: number }) {
  return <Progress variant="ticks" value={pct} className="mt-[18px]" />;
}

function SegBar({
  pct,
  state,
  color,
}: {
  pct: number;
  state?: "normal" | "over";
  color?: string;
}) {
  return (
    <Progress
      variant="segments"
      segments={20}
      value={pct * 100}
      state={state}
      color={state === "over" ? undefined : color}
      className="mt-2.5"
    />
  );
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

  const totalAllocated = data.categories.reduce((s, c) => s + c.allocated, 0);
  const totalSpent = data.categories.reduce((s, c) => s + c.spent, 0);
  const totalRemaining = totalAllocated - totalSpent;
  const unallocatedBudget = data.totalBudget - totalAllocated;
  const spentPct = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0;
  const volNum = String(defaultMonth).padStart(2, "0");
  const monthName = MONTHS[defaultMonth - 1];

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
      <div className="md:grid md:grid-cols-[1fr_1.5fr] md:gap-x-0 ">
        {/* Left column / mobile full */}
        <div>
          {/* Masthead */}
          <div className="fixed w-full top-0 z-10 bg-background">
            <div className="px-7 pt-6 pb-[18px] flex items-end justify-between">
              <div>
                <div className="font-display text-[32px] leading-none tracking-[-0.02em] text-foreground">
                  AlloCat
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                    Vol. {volNum} ·
                  </span>
                  <BottomSheetSelect
                    title="Select Month"
                    options={MONTHS.map((m, i) => ({ value: String(i), label: `${m} ${defaultYear}` }))}
                    value={String(defaultMonth - 1)}
                    onChange={(val) => handleMonthChange(Number(val))}
                    className="bg-transparent border-0 p-0 focus:outline-none inline-flex items-center font-mono text-[10px] tracking-[0.14em] uppercase"
                  />
                </div>
              </div>
            </div>
            {/* Hairline */}
            <div className="h-px bg-border mx-7" />
          </div>

          {/* Hero — Remaining */}
          <div
            id="budget-hero-section"
            className="px-7 pt-7 mt-20 pb-[22px]"
            style={{ background: tintSurface(totalRemaining < 0 ? "var(--neg)" : "var(--pos)", 6) }}
          >
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              {totalRemaining < 0 ? "Over Budget" : "Remaining"} · {monthName.substring(0, 3)}
            </div>
            <div
              className="text-[72px] md:text-[84px] leading-[0.95] tracking-[-0.025em] mt-2.5 tabular-nums"
              style={{ color: totalRemaining < 0 ? "var(--neg)" : softText("var(--pos)", 35) }}
            >
              {totalRemaining < 0 ? "−" : ""}
              <CurrencyText value={Math.abs(totalRemaining)} />
            </div>
            <div className="flex flex-wrap gap-x-[18px] gap-y-1 mt-3.5 font-mono text-[11px] text-muted-foreground">
              <span>
                ↳ allocated <CurrencyText value={totalAllocated} />
              </span>
              <span className="text-foreground">
                · free <CurrencyText value={unallocatedBudget} />
              </span>
            </div>
          </div>

          {/* Hairline */}
          <div className="h-px bg-border mx-7" />

          {/* Spent + Budget + meter */}
          <div id="budget-spend-meter" className="px-7 pt-[22px] pb-5 bg-card">
            <div className="flex justify-between items-baseline">
              <div>
                <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                  Spent
                </div>
                <CurrencyText
                  value={totalSpent}
                  className="text-[38px] tracking-[-0.02em] mt-1 text-foreground tabular-nums"
                />
              </div>
              <div className="text-right">
                <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                  Budget
                </div>
                <div className="text-[22px] tracking-[-0.02em] mt-1 text-muted-foreground tabular-nums">
                  <InlineEditableNumber
                    value={data.totalBudget}
                    onSave={handleUpdateBudget}
                  />
                </div>
              </div>
            </div>
            {budgetTotalError && (
              <p className="mt-2 font-mono text-[11px] text-neg text-right">{budgetTotalError}</p>
            )}
            <div className="flex justify-end mt-3">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground tabular-nums">
                {spentPct}% used
              </span>
            </div>
            <div id="budget-tick-ruler">
              <TickRuler pct={Math.min(spentPct, 100)} />
            </div>
            <div
              className="flex justify-between mt-1.5 font-mono text-[9px] tracking-[0.08em]"
              style={{ color: "var(--dimmer)" }}
            >
              <span>0</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Hairline — only show on mobile before categories */}
          <div className="h-px bg-border mx-7 md:hidden" />
        </div>

        {/* Right column / mobile bottom — Categories */}
        <div>
          {/* Categories header */}
            <div className="md:border-l border-border">
            <div id="budget-categories-header" className="px-7 pt-5 md:pt-[72px] pb-3 flex items-baseline justify-between border-b border-border">
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground tabular-nums">
                Categories · {data.categories.length}
              </div>
              <div className="flex items-center gap-4">
                {data.categories.length === 0 && (
                  <button
                    type="button"
                    onClick={() => { haptic.light(); setIsSetupOpen(true); }}
                    className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground underline underline-offset-4"
                  >
                    Template
                  </button>
                )}
                <button
                  id="add-category-inline"
                  type="button"
                  onClick={openAddCategory}
                  className="font-mono text-[10px] tracking-[0.14em] uppercase text-foreground underline underline-offset-4"
                >
                  + new
                </button>
              </div>
            </div>
          </div>

          {/* Category rows */}
          <div className="md:border-l border-border">
            {data.categories.length === 0 ? (
              <div className="px-7">
                <BudgetEmptyState
                  onSetup={() => { haptic.light(); setIsSetupOpen(true); }}
                  onAddCategory={openAddCategory}
                />
              </div>
            ) : (
              <div className="px-7">
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
                        if (isPending) {
                          e.preventDefault();
                          haptic.error();
                          return;
                        }
                        haptic.selection();
                      }}
                      aria-disabled={isPending}
                      className={`block ${isPending ? "opacity-60 cursor-progress" : ""}`}
                    >
                      <div
                        style={{
                          paddingTop: 14,
                          paddingBottom: 14,
                          borderTop: i === 0 ? "1px solid var(--border)" : "none",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <div className="flex justify-between items-baseline gap-2">
                          <div className="flex items-baseline gap-2.5 min-w-0">
                            <span
                              className="w-[3px] h-3.5 rounded-full shrink-0 self-center"
                              style={{ background: resolveColor({ id: cat.id, color: cat.color }) }}
                            />
                            <span
                              className="font-mono text-[10px] shrink-0"
                              style={{ color: "var(--dimmer)" }}
                            >
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            {cat.icon && (
                              <span className="text-base leading-none shrink-0">
                                {cat.icon}
                              </span>
                            )}
                            <span className="text-[17px] font-medium tracking-[-0.01em] text-foreground truncate">
                              {cat.name}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                              · {cat.subtitle}
                            </span>
                          </div>
                          <div className="font-mono text-[12px] tabular-nums shrink-0">
                            <span style={{ color: isOver ? "var(--neg)" : softText(resolveColor({ id: cat.id, color: cat.color })) }}>
                              <CurrencyText value={cat.spent} />
                            </span>
                            <span className="text-muted-foreground">
                              {" "} / <CurrencyText value={cat.allocated} />
                            </span>
                          </div>
                        </div>
                        <SegBar
                          pct={Math.min(pct, 1)}
                          state={isOver ? "over" : "normal"}
                          color={resolveColor({ id: cat.id, color: cat.color })}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom spacer for mobile nav */}
      <div className="h-28 md:h-12" />

      {/* FAB */}
      <div className="fixed bottom-24 right-6 z-40 md:hidden">
        <button
          id="budget-fab-add"
          type="button"
          onClick={openAddCategory}
          className="flex size-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg shadow-black/30 active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined text-[28px]">add</span>
        </button>
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
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
          <Drawer.Content
            aria-describedby="add-category-description"
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-card border-t border-border focus:outline-none"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-muted rounded-full" />
            </div>

            <div className="px-6 py-4 border-b border-border">
              <Drawer.Title className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted-foreground">
                Add Category
              </Drawer.Title>
              <p id="add-category-description" className="mt-2 text-sm text-foreground">
                Start with a name. Set the icon, allocation, and items after.
              </p>
            </div>

            <form onSubmit={handleCreateCategory} className="px-6 py-5 space-y-4 pb-10">
              <div className="space-y-2">
                <label
                  htmlFor="new-category-name"
                  className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground"
                >
                  Category Name
                </label>
                <input
                  ref={addCategoryInputRef}
                  id="new-category-name"
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Groceries"
                  className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-foreground"
                />
              </div>

              {addCategoryMutation.isError && (
                <p className="font-mono text-[11px] text-neg">{addCategoryError}</p>
              )}

              <div className="flex flex-col gap-3">
                <button
                  type="submit"
                  disabled={!newCategoryName.trim() || addCategoryMutation.isPending}
                  className="w-full border border-foreground px-4 py-3.5 font-mono text-[11px] tracking-[0.14em] uppercase text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-foreground hover:text-background transition-colors"
                >
                  {addCategoryMutation.isPending ? "Creating..." : "Create Category"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddCategoryOpen(false)}
                  className="w-full border border-border px-4 py-3.5 font-mono text-[11px] tracking-[0.14em] uppercase text-muted-foreground"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
