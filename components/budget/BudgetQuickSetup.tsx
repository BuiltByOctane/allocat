"use client";

import { Drawer } from "vaul";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { CurrencySymbol } from "@/components/ui/CurrencySymbol";
import { useFormatCurrency } from "@/lib/hooks/useFormatCurrency";
import { useHaptic } from "@/lib/hooks/useHaptic";
import {
  useBudgetTemplates,
  useEnsureBudgetRow,
  useSetupBudget,
  TEMPLATES_KEY,
} from "@/lib/hooks/useBudget";
import {
  templateToSetupCategories,
  resolveEffectiveTotal,
  rebalanceAllocations,
  type SetupCategory,
} from "@/lib/budget/setupMath";
import { PREDEFINED_TEMPLATES, type BudgetTemplate } from "@/lib/budget-templates";
import { suggestItemNames } from "@/lib/budget/categorySuggestions";
import {
  deleteBudgetTemplate,
  type SaveTemplateInput,
} from "@/lib/actions/budget-templates";
import { clearDraftPlan, type QuizDraft } from "@/lib/budget/quizDraft";

interface BudgetQuickSetupProps {
  isOpen: boolean;
  onClose: () => void;
  /** Resolved budget row id, or "" when the month has no row yet. */
  budgetId: string;
  month: number;
  year: number;
  onDone: () => void;
  /** Open the full template editor for a custom template (BudgetSetupSheet). */
  onEditTemplate?: (t: BudgetTemplate) => void;
  /** A plan built by the onboarding quiz but not saved ("Not now — keep it
   *  for later"). When present, quick-setup opens pre-filled at step 2
   *  instead of the blank step-1 question. */
  initialDraft?: QuizDraft | null;
}

const FIFTY_THIRTY_TWENTY = PREDEFINED_TEMPLATES.find((t) => t.id === "50-30-20")!;

/** Anchor amounts for the step-1 chips — currency-agnostic round numbers. */
const AMOUNT_ANCHORS = [30000, 50000, 75000];

/** Plain-language one-liners for the silent 50/30/20 default, matching the UX
 *  audit's mocks. Other templates fall back to a plain "% of budget" caption. */
const SPLIT_DESCRIPTIONS: Record<string, string> = {
  Needs: "Rent, groceries, bills",
  Wants: "Eating out, fun, shopping",
  Savings: "Future you",
};

/**
 * Two-step budget creation: (1) one question — how much this month — with
 * amount-anchor chips; (2) a split that's already done — 50/30/20 pre-filled
 * with real rupee amounts and a drag-to-rebalance slider per category, so the
 * sum always equals the total. Everything else (other methods, custom
 * categories, save-as-template) sits behind "More ways to split". Item
 * editing still happens later on each category's detail page.
 */
export function BudgetQuickSetup({
  isOpen,
  onClose,
  budgetId,
  month,
  year,
  onDone,
  onEditTemplate,
  initialDraft,
}: BudgetQuickSetupProps) {
  const haptic = useHaptic();
  const fmt = useFormatCurrency();
  const qc = useQueryClient();
  const ensureRow = useEnsureBudgetRow();
  const setupMutation = useSetupBudget();
  const templatesQuery = useBudgetTemplates();

  const [step, setStep] = useState<1 | 2>(1);
  const [totalBudget, setTotalBudget] = useState("");
  const [pickedTemplate, setPickedTemplate] = useState<BudgetTemplate | null>(null);
  const [categories, setCategories] = useState<SetupCategory[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showMoreWays, setShowMoreWays] = useState(false);
  const [fromDraft, setFromDraft] = useState(false);
  const [draftPlanName, setDraftPlanName] = useState("");

  const totalRef = useRef<HTMLInputElement>(null);

  const monthLabel = new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: "long",
  });

  function startFresh() {
    haptic.light();
    setFromDraft(false);
    setStep(1);
    setTotalBudget("");
    setPickedTemplate(null);
    setCategories([]);
    setError("");
  }

  useEffect(() => {
    if (!isOpen) return;
    setNewCatName("");
    setSaveAsTemplate(false);
    setTemplateName("");
    setError("");
    setShowMoreWays(false);

    if (initialDraft) {
      setFromDraft(true);
      setDraftPlanName(initialDraft.planName);
      setStep(2);
      setTotalBudget(String(initialDraft.total));
      setPickedTemplate(null);
      setCategories(
        initialDraft.categories.map((c) => ({
          id: crypto.randomUUID(),
          name: c.name,
          icon: c.icon,
          allocation: c.allocation,
          allocationPct: null,
          items: c.items.map((i) => ({
            id: crypto.randomUUID(),
            name: i.name,
            allocation: i.allocation,
            linkType: null,
            linkId: null,
            templateItemId: null,
          })),
        }))
      );
      return;
    }

    setFromDraft(false);
    setStep(1);
    setTotalBudget("");
    setPickedTemplate(null);
    setCategories([]);
    const t = setTimeout(() => totalRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [isOpen, initialDraft]);

  const totalNum = parseFloat(totalBudget) || 0;
  const totalAllocated = categories.reduce((s, c) => s + c.allocation, 0);
  const leftToAllocate = totalNum - totalAllocated;
  const isOverAllocated = totalNum > 0 && leftToAllocate < 0;
  const effective = resolveEffectiveTotal(totalNum, totalAllocated);
  const canCreate = effective.total > 0 || categories.length > 0;
  // "Blank" (or nothing picked yet) → free-form category rows, no rebalance slider.
  const isManualMode = pickedTemplate === null;

  /** Apply a template against the current total. Categories with no pct (e.g.
   *  Zero-Based, Bare Minimum) would otherwise land on a wall of ₹0s — split
   *  the total evenly across them instead. */
  function applyTemplate(t: BudgetTemplate, total: number) {
    haptic.selection();
    if (t.id === "blank") {
      setPickedTemplate(null);
      setCategories([]);
      setError("");
      return;
    }
    let next = templateToSetupCategories(t, total, () => crypto.randomUUID());
    const allocatedSum = next.reduce((s, c) => s + c.allocation, 0);
    if (allocatedSum === 0 && next.length > 0 && total > 0) {
      const base = Math.floor(total / next.length);
      const remainder = total - base * next.length;
      next = next.map((c, i) => ({
        ...c,
        allocationPct: null,
        allocation: base + (i < remainder ? 1 : 0),
      }));
    }
    setPickedTemplate(t);
    setCategories(next);
    setError("");
  }

  function handleContinue() {
    if (totalNum <= 0) {
      setError("Enter your monthly amount to continue.");
      haptic.error();
      return;
    }
    setError("");
    applyTemplate(FIFTY_THIRTY_TWENTY, totalNum);
    setStep(2);
  }

  function handleSliderChange(id: string, val: number) {
    setCategories((prev) => rebalanceAllocations(prev, id, val, totalNum));
  }

  function updateAllocation(id: string, val: string) {
    const num = parseFloat(val) || 0;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, allocation: num, allocationPct: null } : c
      )
    );
  }

  function updateName(id: string, name: string) {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  }

  function removeCategory(id: string) {
    haptic.heavy();
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    haptic.selection();
    // Seed 3-5 common items at ₹0 — fill in, don't author. The user types
    // numbers and deletes what doesn't apply, instead of inventing item names.
    const seeded = suggestItemNames(name, null).slice(0, 5);
    setCategories((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name,
        icon: null,
        allocation: 0,
        allocationPct: null,
        items: seeded.map((itemName) => ({
          id: crypto.randomUUID(),
          name: itemName,
          allocation: 0,
          linkType: null,
          linkId: null,
          templateItemId: null,
        })),
      },
    ]);
    setNewCatName("");
  }

  async function handleDeleteTemplate(id: string) {
    haptic.heavy();
    try {
      await deleteBudgetTemplate(id);
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    } catch {
      /* list refetch reconciles */
    }
  }

  function buildTemplatePayload(finalTotal: number): SaveTemplateInput {
    return {
      name: templateName.trim(),
      description: pickedTemplate?.description?.trim() || "Custom template",
      preview: categories.map((c) => c.name).slice(0, 4),
      categories: categories.map((c) => ({
        name: c.name,
        icon: c.icon,
        allocationPct:
          finalTotal > 0 && c.allocation > 0
            ? Math.round((c.allocation / finalTotal) * 100)
            : null,
        items: c.items.map((i) => ({
          name: i.name,
          templateItemId: i.templateItemId ?? i.id,
          plannedAmount: i.allocation > 0 ? i.allocation : undefined,
          linkType: i.linkType ?? undefined,
          linkId: i.linkId ?? undefined,
        })),
      })),
    };
  }

  async function handleCreate() {
    if (!canCreate || isCreating) return;
    const willSaveTemplate = saveAsTemplate && categories.length > 0;
    if (willSaveTemplate && !templateName.trim()) {
      setError("Give the template a name.");
      haptic.error();
      return;
    }

    setIsCreating(true);
    setError("");
    try {
      const resolvedBudgetId = budgetId || (await ensureRow(month, year));

      const savedTemplateId = willSaveTemplate ? crypto.randomUUID() : null;
      const templateId = savedTemplateId ?? pickedTemplate?.id ?? null;

      await setupMutation.mutateAsync({
        budgetId: resolvedBudgetId,
        month,
        year,
        totalBudget: effective.total,
        templateId,
        categories: categories.filter((c) => c.name.trim()),
        saveAsTemplate: willSaveTemplate
          ? {
              id: savedTemplateId!,
              payload: buildTemplatePayload(effective.total),
            }
          : null,
      });

      haptic.success();
      clearDraftPlan();
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the budget.");
      haptic.error();
    } finally {
      setIsCreating(false);
    }
  }

  const userTemplates = templatesQuery.data ?? [];
  const sliderStep = Math.max(1, Math.round(totalNum / 200));

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content
          aria-describedby="quick-setup-description"
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card focus:outline-none sheet-3q"
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="mx-auto w-9 h-1 bg-border rounded-full" />
          </div>

          {step === 1 ? (
            <>
              <div className="px-5 pt-3 pb-3 shrink-0">
                <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground">
                  How much can you spend in {monthLabel}?
                </Drawer.Title>
                <p
                  id="quick-setup-description"
                  className="mt-1 text-sm text-muted-foreground"
                >
                  Just one number - we&apos;ll split it for you.
                </p>
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-2 space-y-4 pb-6">
                <div className="relative">
                  <input
                    ref={totalRef}
                    type="number"
                    inputMode="decimal"
                    value={totalBudget}
                    onChange={(e) => {
                      setTotalBudget(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleContinue();
                    }}
                    placeholder="e.g. 50000"
                    min="0"
                    className="w-full rounded-[16px] border-2 border-[var(--accent-strong)] bg-card pl-11 pr-4 py-5 text-[28px] font-bold text-foreground outline-none tabular-nums"
                  />
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[24px] font-bold text-muted-foreground">
                    <CurrencySymbol className="currency-symbol" />
                  </span>
                </div>

                <div className="flex gap-2">
                  {AMOUNT_ANCHORS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        haptic.selection();
                        setTotalBudget(String(amt));
                        setError("");
                      }}
                      className="shrink-0 rounded-full bg-tile px-3.5 py-2 text-[12.5px] font-bold text-foreground"
                    >
                      {fmt(amt)}
                    </button>
                  ))}
                </div>

                {error && <p className="text-[11px] font-medium text-neg">{error}</p>}
              </div>

              <div className="shrink-0 border-t border-border bg-card px-5 pt-3.5 pb-8">
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={totalNum <= 0}
                  className="w-full h-[48px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                >
                  Continue
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="px-5 pt-3 pb-3 shrink-0 flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => {
                    haptic.light();
                    setStep(1);
                  }}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground -ml-1 mt-0.5"
                  aria-label="Back"
                >
                  <span className="material-symbols-outlined text-lg">
                    chevron_left
                  </span>
                </button>
                <div>
                  <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground">
                    Here&apos;s your split
                  </Drawer.Title>
                  <p
                    id="quick-setup-description"
                    className="mt-1 text-sm text-muted-foreground"
                  >
                    A proven starting point. Drag to adjust - it always adds up.
                  </p>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-2 space-y-2.5 pb-6">
                {fromDraft && (
                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-accent/10 px-4 py-2.5 ring-1 ring-[var(--accent-strong)]/30">
                    <span className="text-[12px] font-semibold text-foreground">
                      From your quiz: {draftPlanName}
                    </span>
                    <button
                      type="button"
                      onClick={startFresh}
                      className="shrink-0 text-[11.5px] font-bold text-muted-foreground underline underline-offset-2"
                    >
                      Start fresh
                    </button>
                  </div>
                )}
                {isManualMode ? (
                  <div className="space-y-2.5">
                    {categories.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center gap-2.5 rounded-2xl bg-tile px-3.5 py-2.5"
                      >
                        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-chip text-[15px]">
                          {cat.icon || "📁"}
                        </span>
                        <input
                          type="text"
                          value={cat.name}
                          onChange={(e) => updateName(cat.id, e.target.value)}
                          placeholder="Category"
                          className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-foreground outline-none"
                        />
                        <div className="flex items-center gap-1 shrink-0">
                          <CurrencySymbol className="text-[11px] text-muted-foreground" />
                          <input
                            type="number"
                            inputMode="decimal"
                            value={cat.allocation || ""}
                            onChange={(e) => updateAllocation(cat.id, e.target.value)}
                            placeholder="0"
                            min="0"
                            className="w-[76px] bg-transparent text-right text-sm font-bold tabular-nums text-foreground outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCategory(cat.id)}
                          className="text-muted-foreground shrink-0 p-0.5"
                          aria-label={`Remove ${cat.name}`}
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            close
                          </span>
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border px-4 py-3">
                      <input
                        type="text"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addCategory();
                        }}
                        placeholder="Add category…"
                        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                      />
                      <button
                        type="button"
                        onClick={addCategory}
                        disabled={!newCatName.trim()}
                        className="text-muted-foreground disabled:opacity-30 transition-colors"
                        aria-label="Add category"
                      >
                        <span className="material-symbols-outlined text-lg">
                          add_circle
                        </span>
                      </button>
                    </div>

                    {(totalNum > 0 || totalAllocated > 0) && (
                      <div className="space-y-1.5 pt-1">
                        <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-200 ${
                              isOverAllocated ? "bg-amber-500" : "bg-accent-strong"
                            }`}
                            style={{
                              width: `${
                                totalNum > 0
                                  ? Math.min(100, Math.round((totalAllocated / totalNum) * 100))
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
                          <span>
                            <CurrencyText value={totalAllocated} /> allocated
                          </span>
                          <span
                            className={
                              isOverAllocated
                                ? "text-amber-600 dark:text-amber-500 font-semibold"
                                : "text-accent-strong font-semibold"
                            }
                          >
                            {isOverAllocated ? (
                              <>
                                <CurrencyText value={Math.abs(leftToAllocate)} /> over -
                                total will adjust
                              </>
                            ) : (
                              <>
                                <CurrencyText value={leftToAllocate} /> left
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {categories.map((cat) => {
                      const pct =
                        totalNum > 0 ? Math.round((cat.allocation / totalNum) * 100) : 0;
                      const description =
                        SPLIT_DESCRIPTIONS[cat.name] ?? `${pct}% of budget`;
                      return (
                        <div key={cat.id} className="rounded-2xl bg-tile px-4 py-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                              {cat.icon ? <span>{cat.icon}</span> : null}
                              {cat.name}
                            </span>
                            <span className="font-display text-[17px] font-extrabold tabular-nums text-foreground">
                              <CurrencyText value={cat.allocation} />
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                            {description}
                            {SPLIT_DESCRIPTIONS[cat.name] ? ` · ${pct}%` : ""}
                          </p>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(totalNum, 1)}
                            step={sliderStep}
                            value={Math.min(cat.allocation, Math.max(totalNum, 1))}
                            onChange={(e) =>
                              handleSliderChange(cat.id, Number(e.target.value))
                            }
                            disabled={totalNum <= 0}
                            className="mt-2.5 w-full accent-[var(--accent-strong)]"
                            aria-label={`${cat.name} amount`}
                          />
                        </div>
                      );
                    })}

                    {totalNum > 0 && (
                      <div className="flex items-center justify-between rounded-pill bg-accent px-4 py-2.5">
                        <span className="text-[13px] font-bold text-[var(--accent-ink)]">
                          All <CurrencyText value={totalNum} /> assigned
                        </span>
                        <span className="font-bold text-[var(--accent-ink)]">✓</span>
                      </div>
                    )}
                  </div>
                )}

                {/* More ways to split — other methods, custom categories, save-as-template */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      haptic.light();
                      setShowMoreWays((v) => !v);
                    }}
                    className="flex w-full items-center justify-center gap-1 py-2 text-xs font-semibold text-muted-foreground"
                  >
                    More ways to split
                    <span
                      className={`material-symbols-outlined text-base transition-transform ${
                        showMoreWays ? "rotate-180" : ""
                      }`}
                    >
                      expand_more
                    </span>
                  </button>

                  {showMoreWays && (
                    <div className="space-y-4 pt-1">
                      <div>
                        <p className="t-label text-muted-foreground mb-2">Start from</p>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
                          {PREDEFINED_TEMPLATES.map((t) => {
                            const active =
                              t.id === "blank"
                                ? pickedTemplate === null && categories.length === 0
                                : pickedTemplate?.id === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => applyTemplate(t, totalNum)}
                                className={`shrink-0 rounded-full px-3.5 py-2 text-[12px] font-bold transition-colors border ${
                                  active
                                    ? "bg-[var(--pill)] text-[var(--pill-foreground)] border-transparent"
                                    : "bg-tile text-foreground border-border"
                                }`}
                              >
                                {t.name}
                              </button>
                            );
                          })}
                        </div>
                        {userTemplates.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="t-label text-muted-foreground">My templates</p>
                            {userTemplates.map((t) => (
                              <div
                                key={t.id}
                                className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 border ${
                                  pickedTemplate?.id === t.id
                                    ? "bg-tile border-[var(--accent-strong)]"
                                    : "bg-tile border-transparent"
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => applyTemplate(t, totalNum)}
                                  className="flex-1 text-left"
                                >
                                  <p className="text-sm font-semibold text-foreground">
                                    {t.name}
                                  </p>
                                  {t.preview.length > 0 && (
                                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                      {t.preview.slice(0, 4).join(" · ")}
                                    </p>
                                  )}
                                </button>
                                {onEditTemplate && (
                                  <button
                                    type="button"
                                    onClick={() => onEditTemplate(t)}
                                    className="text-muted-foreground shrink-0 p-1"
                                    aria-label={`Edit template ${t.name}`}
                                  >
                                    <span className="material-symbols-outlined text-base">
                                      edit
                                    </span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTemplate(t.id)}
                                  className="text-muted-foreground shrink-0 p-1"
                                  aria-label={`Delete template ${t.name}`}
                                >
                                  <span className="material-symbols-outlined text-base">
                                    delete
                                  </span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {categories.length > 0 && (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={saveAsTemplate}
                            onClick={() => setSaveAsTemplate((v) => !v)}
                            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                              saveAsTemplate ? "bg-[var(--accent-strong)]" : "bg-muted"
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                saveAsTemplate ? "translate-x-5" : "translate-x-0"
                              }`}
                            />
                          </button>
                          {saveAsTemplate ? (
                            <input
                              type="text"
                              value={templateName}
                              onChange={(e) => setTemplateName(e.target.value)}
                              placeholder="Template name"
                              className="flex-1 bg-transparent border-b border-border pb-1 text-sm text-foreground outline-none focus:border-[var(--accent-strong)]"
                            />
                          ) : (
                            <span className="text-[12px] font-medium text-muted-foreground">
                              Save as template for next time
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {error && <p className="text-[11px] font-medium text-neg">{error}</p>}
              </div>

              <div className="shrink-0 border-t border-border bg-card px-5 pt-3.5 pb-8">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!canCreate || isCreating}
                  className="w-full h-[48px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                >
                  {isCreating
                    ? "Creating…"
                    : effective.bumped
                      ? `Create - set total to ${fmt(effective.total)}`
                      : "Create my budget"}
                </button>
              </div>
            </>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
