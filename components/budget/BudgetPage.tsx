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
import {
  useAddBudgetCategory,
  useUpdateBudgetTotal,
  useBudgetTemplateHeader,
  budgetKey,
  TEMPLATES_KEY,
} from "@/lib/hooks/useBudget";
import type { BudgetTemplate } from "@/lib/budget-templates";
import { DASHBOARD_KEY } from "@/lib/hooks/useDashboard";
import { ensureBudgetRow } from "@/lib/actions/budget";
import { getDB } from "@/lib/db";
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
  templateId: string | null;
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
  const [setupMode, setSetupMode] = useState<
    "create" | "saveTemplate" | "editLinkedTemplate" | "updateTemplate"
  >("create");
  const [setupTemplate, setSetupTemplate] = useState<BudgetTemplate | null>(null);
  const [spendOpen, setSpendOpen] = useState(false);
  // When no budget row exists yet, data.id is "" (a virtual empty budget). The
  // real row is created on the first write; resolvedId holds it for this session
  // until the refetched data.id catches up. Always prefer data.id when present.
  const [resolvedId, setResolvedId] = useState("");
  const effectiveBudgetId = data.id || resolvedId;

  const ensureBudgetId = useCallback(async (): Promise<string> => {
    if (data.id) return data.id;
    if (resolvedId) return resolvedId;
    const row = await ensureBudgetRow(defaultMonth, defaultYear);
    await getDB().budgets.put(row);
    setResolvedId(row.id);
    qc.invalidateQueries({ queryKey: budgetKey(defaultMonth, defaultYear) });
    qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    return row.id;
  }, [data.id, resolvedId, defaultMonth, defaultYear, qc]);

  const openSetup = useCallback(async () => {
    haptic.light();
    await ensureBudgetId();
    setSetupMode("create");
    setIsSetupOpen(true);
  }, [haptic, ensureBudgetId]);

  // Capture the current month's budget as a new reusable template.
  const openSaveTemplate = useCallback(() => {
    haptic.light();
    setSetupTemplate(null);
    setSetupMode("saveTemplate");
    setIsSetupOpen(true);
  }, [haptic]);

  // Edit the linked template (template → budget: also syncs into this month).
  const openEditTemplate = useCallback(
    (template: BudgetTemplate) => {
      haptic.light();
      setSetupTemplate(template);
      setSetupMode("editLinkedTemplate");
      setIsSetupOpen(true);
    },
    [haptic]
  );

  // Push the (drifted) current budget into the existing template (budget → template).
  const openUpdateTemplate = useCallback(
    (template: BudgetTemplate) => {
      haptic.light();
      setSetupTemplate(template);
      setSetupMode("updateTemplate");
      setIsSetupOpen(true);
    },
    [haptic]
  );

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
    void (async () => {
      const budgetId = await ensureBudgetId();
      updateBudgetTotalMutation.mutate({
        budgetId,
        totalAmount,
        month: defaultMonth,
        year: defaultYear,
      });
    })();
  }

  async function handleCreateCategory(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const name = newCategoryName.trim();
    if (!name || addCategoryMutation.isPending) return;
    try {
      const budgetId = await ensureBudgetId();
      const category = await addCategoryMutation.mutateAsync({
        budgetId,
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
            {/* When empty, the empty-state primary CTA drives setup — keep this
                header link low-key so it doesn't compete. ＋New is the accent
                action only once categories exist. */}
            {data.categories.length > 0 && (
              <TemplateControl
                budgetId={effectiveBudgetId}
                templateId={data.templateId}
                onSaveTemplate={openSaveTemplate}
                onEditTemplate={openEditTemplate}
                onUpdateTemplate={openUpdateTemplate}
              />
            )}
            {/* While empty, the empty-state card owns both CTAs — don't duplicate
                "Add manually" here. ＋New only appears once categories exist. */}
            {data.categories.length > 0 && (
              <button
                id="add-category-inline"
                type="button"
                onClick={openAddCategory}
                className="flex items-center gap-1 text-[13px] font-bold text-foreground"
              >
                <span className="text-accent-strong text-base leading-none">＋</span>New
              </button>
            )}
          </div>
        </div>

        {/* Category list */}
        {data.categories.length === 0 ? (
          <BudgetEmptyState
            onSetup={openSetup}
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
        mode={setupMode}
        linkedTemplate={setupTemplate}
        budgetId={effectiveBudgetId}
        existingTotalBudget={data.totalBudget}
        onDone={() => {
          qc.invalidateQueries({ queryKey: budgetKey(defaultMonth, defaultYear) });
          qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
          qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
          qc.invalidateQueries({ queryKey: ["budgetDriftItems", effectiveBudgetId] });
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

            <form onSubmit={handleCreateCategory} className="flex flex-col min-h-0 flex-1">
              <div className="px-6 py-4 shrink-0">
                <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground">
                  Add category
                </Drawer.Title>
                <p id="add-category-description" className="mt-1 text-[13px] text-muted-foreground">
                  Start with a name. Set the icon, allocation, and items after.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-2 space-y-4">
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
              </div>

              <div className="flex flex-col gap-3 px-6 pt-2 pb-10 shrink-0">
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

// ─── State-aware template control (categories header) ─────────────────────────

interface TemplateControlProps {
  budgetId: string;
  templateId: string | null;
  onSaveTemplate: () => void;
  onEditTemplate: (t: BudgetTemplate) => void;
  onUpdateTemplate: (t: BudgetTemplate) => void;
}

function TemplateControl({
  budgetId,
  templateId,
  onSaveTemplate,
  onEditTemplate,
  onUpdateTemplate,
}: TemplateControlProps) {
  const haptic = useHaptic();
  const [driftedOpen, setDriftedOpen] = useState(false);
  const { template, isCustom, isDeleted, drifted, isLoading } =
    useBudgetTemplateHeader({ budgetId, templateId });

  // Not linked (or the linked custom template was deleted) → offer to save one.
  if (!templateId || isDeleted) {
    return (
      <button
        type="button"
        onClick={onSaveTemplate}
        className="flex items-center gap-1 text-[13px] font-bold text-muted-foreground"
        aria-label="Save current budget as template"
      >
        <span className="material-symbols-outlined text-base leading-none">
          bookmark_add
        </span>
        Template
      </button>
    );
  }

  // Resolving the name/drift — hold a stable placeholder to avoid flicker.
  if (!template || isLoading) {
    return (
      <span className="flex items-center gap-1 text-[13px] font-bold text-muted-foreground opacity-60">
        <span className="material-symbols-outlined text-base leading-none">
          bookmark
        </span>
        Template
      </span>
    );
  }

  // Linked + clean → name, with an edit affordance for custom templates.
  if (!drifted) {
    const chip = (
      <span className="flex items-center gap-1 text-[13px] font-bold text-foreground max-w-[140px]">
        <span className="material-symbols-outlined text-base leading-none text-accent-strong">
          bookmark
        </span>
        <span className="truncate">{template.name}</span>
      </span>
    );
    if (!isCustom) return chip;
    return (
      <button
        type="button"
        onClick={() => onEditTemplate(template)}
        className="flex items-center gap-1"
        aria-label={`Edit template ${template.name}`}
      >
        {chip}
        <span className="material-symbols-outlined text-[15px] leading-none text-muted-foreground">
          edit
        </span>
      </button>
    );
  }

  // Linked + drifted → tap opens the update / save-as-new choice.
  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptic.light();
          setDriftedOpen(true);
        }}
        className="flex items-center gap-1 text-[13px] font-bold text-amber-600 dark:text-amber-500 max-w-[160px]"
        aria-label={`Template ${template.name} modified`}
      >
        <span className="material-symbols-outlined text-base leading-none">
          bookmark
        </span>
        <span className="truncate">{template.name}</span>
        <span className="text-[10px] font-bold uppercase tracking-wide shrink-0">
          · Edited
        </span>
      </button>

      <Drawer.Root open={driftedOpen} onOpenChange={setDriftedOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Drawer.Content
            aria-describedby="template-drift-description"
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card focus:outline-none"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-9 h-1 bg-border rounded-full" />
            </div>
            <div className="px-6 py-4">
              <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground">
                Budget changed
              </Drawer.Title>
              <p
                id="template-drift-description"
                className="mt-1 text-[13px] text-muted-foreground"
              >
                This budget no longer matches{" "}
                <span className="font-semibold text-foreground">
                  {template.name}
                </span>
                . Save the changes to the template or create a new one.
              </p>

              <div className="mt-5 flex flex-col gap-3 pb-8">
                {isCustom && (
                  <button
                    type="button"
                    onClick={() => {
                      setDriftedOpen(false);
                      onUpdateTemplate(template);
                    }}
                    className="w-full h-[48px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold active:scale-[0.98] transition-all"
                  >
                    Update &ldquo;{template.name}&rdquo;
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDriftedOpen(false);
                    onSaveTemplate();
                  }}
                  className="w-full h-[48px] rounded-pill bg-muted text-foreground text-sm font-semibold active:scale-[0.98] transition-all"
                >
                  Save as new template
                </button>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
