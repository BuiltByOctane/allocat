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
  recalcPercentageAllocations,
  resolveEffectiveTotal,
  type SetupCategory,
} from "@/lib/budget/setupMath";
import { PREDEFINED_TEMPLATES, type BudgetTemplate } from "@/lib/budget-templates";
import {
  deleteBudgetTemplate,
  type SaveTemplateInput,
} from "@/lib/actions/budget-templates";

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
}

/**
 * Categories-first budget creation: one scrollable screen — total, a template
 * to start from, category amounts. No item editing; template items are still
 * created invisibly (with durable SMS identity) and can be fine-tuned later on
 * each category's detail page. Replaces BudgetSetupSheet's create mode.
 */
export function BudgetQuickSetup({
  isOpen,
  onClose,
  budgetId,
  month,
  year,
  onDone,
  onEditTemplate,
}: BudgetQuickSetupProps) {
  const haptic = useHaptic();
  const fmt = useFormatCurrency();
  const qc = useQueryClient();
  const ensureRow = useEnsureBudgetRow();
  const setupMutation = useSetupBudget();
  const templatesQuery = useBudgetTemplates();

  const [totalBudget, setTotalBudget] = useState("");
  const [pickedTemplate, setPickedTemplate] = useState<BudgetTemplate | null>(null);
  const [categories, setCategories] = useState<SetupCategory[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const totalRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTotalBudget("");
    setPickedTemplate(null);
    setCategories([]);
    setNewCatName("");
    setSaveAsTemplate(false);
    setTemplateName("");
    setError("");
    const t = setTimeout(() => totalRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [isOpen]);

  const totalNum = parseFloat(totalBudget) || 0;
  const totalAllocated = categories.reduce((s, c) => s + c.allocation, 0);
  const leftToAllocate = totalNum - totalAllocated;
  const isOverAllocated = totalNum > 0 && leftToAllocate < 0;
  const allocPct =
    totalNum > 0
      ? Math.min(100, Math.round((totalAllocated / totalNum) * 100))
      : 0;
  const effective = resolveEffectiveTotal(totalNum, totalAllocated);
  const canCreate = effective.total > 0 || categories.length > 0;

  function handleTotalChange(val: string) {
    setTotalBudget(val);
    const num = parseFloat(val) || 0;
    setCategories((prev) => recalcPercentageAllocations(prev, num));
  }

  function pickTemplate(t: BudgetTemplate) {
    haptic.selection();
    setPickedTemplate(t.id === "blank" ? null : t);
    setCategories(
      templateToSetupCategories(t, totalNum, () => crypto.randomUUID())
    );
    setError("");
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
    setCategories((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name,
        icon: null,
        allocation: 0,
        allocationPct: null,
        items: [],
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

          <div className="px-5 pt-3 pb-3 shrink-0">
            <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground">
              Set up this month
            </Drawer.Title>
            <p id="quick-setup-description" className="mt-1 text-sm text-muted-foreground">
              A total and a few categories - that&apos;s it.
            </p>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-2 space-y-5 pb-6">
            {/* Total */}
            <div>
              <label className="t-label text-muted-foreground">
                Monthly budget <CurrencySymbol className="currency-symbol" />
              </label>
              <input
                ref={totalRef}
                type="number"
                inputMode="decimal"
                value={totalBudget}
                onChange={(e) => handleTotalChange(e.target.value)}
                placeholder="e.g. 50000"
                min="0"
                className="mt-2 w-full rounded-[13px] border border-border bg-card px-4 py-3 text-lg font-bold text-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
              />
            </div>

            {/* Start from */}
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
                      onClick={() => pickTemplate(t)}
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
                        onClick={() => pickTemplate(t)}
                        className="flex-1 text-left"
                      >
                        <p className="text-sm font-semibold text-foreground">{t.name}</p>
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
                          <span className="material-symbols-outlined text-base">edit</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(t.id)}
                        className="text-muted-foreground shrink-0 p-1"
                        aria-label={`Delete template ${t.name}`}
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Categories */}
            <div className="space-y-2.5">
              <p className="t-label text-muted-foreground">Categories</p>
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
                    <span className="material-symbols-outlined text-[18px]">close</span>
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
                  <span className="material-symbols-outlined text-lg">add_circle</span>
                </button>
              </div>
              {categories.length > 0 && (
                <p className="text-[11px] text-muted-foreground px-1">
                  Add specific items inside each category later - tap a category
                  on the budget page.
                </p>
              )}
            </div>
          </div>

          {/* Pinned footer */}
          <div className="shrink-0 border-t border-border bg-card px-5 pt-3.5 pb-8 space-y-3">
            {/* Allocation tracker — informative, never blocking */}
            {(totalNum > 0 || totalAllocated > 0) && (
              <div className="space-y-1.5">
                <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${
                      isOverAllocated ? "bg-amber-500" : "bg-accent-strong"
                    }`}
                    style={{ width: `${allocPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
                  <span>
                    <CurrencyText value={totalAllocated} /> allocated
                  </span>
                  {totalNum > 0 && (
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
                  )}
                </div>
              </div>
            )}
            {totalNum === 0 && totalAllocated > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Total set from your categories.
              </p>
            )}

            {/* Save as template */}
            {categories.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={saveAsTemplate}
                  onClick={() => setSaveAsTemplate((v) => !v)}
                  className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                    saveAsTemplate ? "bg-[var(--accent-strong)]" : "bg-muted"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      saveAsTemplate ? "translate-x-[18px]" : "translate-x-0.5"
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

            {error && <p className="text-[11px] font-medium text-neg">{error}</p>}

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
                  : "Create budget"}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
