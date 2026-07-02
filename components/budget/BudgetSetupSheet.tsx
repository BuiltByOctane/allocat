"use client";

import { Drawer } from "vaul";
import { useEffect, useRef, useState } from "react";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { CurrencySymbol } from "@/components/ui/CurrencySymbol";
import { useFormatCurrency } from "@/lib/hooks/useFormatCurrency";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useEnqueue } from "@/lib/hooks/useSync";
import { getDB } from "@/lib/db";
import { reapplyRulesToPending } from "@/lib/sms/ingestClient";
import { pushSmsMirrorToNative } from "@/lib/sms/nativeMirror";
import { PREDEFINED_TEMPLATES, type BudgetTemplate } from "@/lib/budget-templates";
import {
  getBudgetTemplates,
  saveBudgetTemplate,
  updateBudgetTemplate,
  deleteBudgetTemplate,
  type SaveTemplateInput,
  type StampTemplateInput,
} from "@/lib/actions/budget-templates";
import { saveTemplateDurableId } from "@/lib/budget/saveTemplateDurableId";

type LinkType = "asset" | "debt";

/** "create" builds a new budget; "saveTemplate"/"editTemplate" only persist a template. */
type SetupMode = "create" | "saveTemplate" | "editTemplate";

interface SetupItem {
  id: string;
  name: string;
  allocation: number;
  linkType?: LinkType | null;
  linkId?: string | null;
  /**
   * Durable template-item identity, preserved across edits/renames so SMS rules
   * follow the item month to month. Carried from a template or an existing
   * budget item; falls back to the row's `id` for brand-new manual items.
   */
  templateItemId?: string | null;
  /**
   * The real `budget_items.id` this form item was prefilled from (may be a
   * `temp_` id if the budget was built offline). Only set by `prefillFromBudget`
   * ("Save as template" from an existing budget) — undefined for the template
   * picker / manual-create paths, where there is no underlying row yet.
   */
  sourceItemId?: string | null;
}

/** Stable durable id for an item — its template id, or its row id as a fallback. */
function itemTemplateItemId(i: SetupItem): string {
  return i.templateItemId ?? i.id;
}

interface SetupCategory {
  id: string;
  name: string;
  icon: string | null;
  allocation: number;
  allocationPct: number | null; // auto-recalculates when total budget changes
  items: SetupItem[];
}

interface BudgetSetupSheetProps {
  isOpen: boolean;
  onClose: () => void;
  budgetId: string;
  existingTotalBudget: number;
  onDone: () => void;
  /** "create" (default) = pick/build a budget. "saveTemplate" = capture the
   *  current budget as a template only (no budget writes). */
  mode?: "create" | "saveTemplate";
}

function templateToCategories(
  template: BudgetTemplate,
  totalBudget: number
): SetupCategory[] {
  return template.categories.map((cat) => ({
    id: crypto.randomUUID(),
    name: cat.name,
    icon: cat.icon,
    allocationPct: cat.allocationPct,
    allocation:
      cat.allocationPct !== null && totalBudget > 0
        ? Math.round((cat.allocationPct / 100) * totalBudget)
        : 0,
    items: cat.items.map((item) => ({
      id: crypto.randomUUID(),
      name: item.name,
      allocation: item.plannedAmount ?? 0,
      linkType: item.linkType ?? null,
      linkId: item.linkId ?? null,
      templateItemId: item.templateItemId ?? null,
    })),
  }));
}

function recalcPercentageAllocations(
  categories: SetupCategory[],
  totalBudget: number
): SetupCategory[] {
  return categories.map((cat) =>
    cat.allocationPct !== null
      ? {
          ...cat,
          allocation:
            totalBudget > 0
              ? Math.round((cat.allocationPct / 100) * totalBudget)
              : 0,
        }
      : cat
  );
}

export function BudgetSetupSheet({
  isOpen,
  onClose,
  budgetId,
  existingTotalBudget,
  onDone,
  mode = "create",
}: BudgetSetupSheetProps) {
  const haptic = useHaptic();
  const fmt = useFormatCurrency();
  const enqueue = useEnqueue();

  const [step, setStep] = useState<1 | 2>(1);
  const [internalMode, setInternalMode] = useState<SetupMode>("create");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [userTemplates, setUserTemplates] = useState<BudgetTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] =
    useState<BudgetTemplate | null>(null);

  const isTemplateMode =
    internalMode === "saveTemplate" || internalMode === "editTemplate";

  // Step 2 state
  const [totalBudget, setTotalBudget] = useState("");
  const [categories, setCategories] = useState<SetupCategory[]>([]);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const totalBudgetRef = useRef<HTMLInputElement>(null);

  // On open: "saveTemplate" jumps straight to step 2 prefilled from the current
  // budget; otherwise show the template picker (step 1).
  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setEditingTemplateId(null);
    setSelectedTemplate(null);
    setInternalMode(mode);

    if (mode === "saveTemplate") {
      void prefillFromBudget();
      return;
    }

    setStep(1);
    let cancelled = false;
    getBudgetTemplates()
      .then((t) => {
        if (!cancelled) setUserTemplates(t);
      })
      .catch(() => {
        if (!cancelled) setUserTemplates([]);
      });
    return () => {
      cancelled = true;
    };
    // prefillFromBudget reads stable refs (budgetId); excluded intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode]);

  // Build step-2 state from the current budget's IDB rows (categories + items,
  // preserving each item's asset/debt link).
  async function prefillFromBudget() {
    const db = getDB();
    const [budget, cats] = await Promise.all([
      db.budgets.get(budgetId),
      db.categories.where("budget_id").equals(budgetId).toArray(),
    ]);
    const setupCats: SetupCategory[] = [];
    for (const cat of cats) {
      const items = await db.budget_items
        .where("category_id")
        .equals(cat.id)
        .toArray();
      setupCats.push({
        id: crypto.randomUUID(),
        name: cat.name,
        icon: cat.icon,
        allocation: cat.allocated_amount,
        allocationPct: null,
        items: items.map((it) => ({
          id: crypto.randomUUID(),
          name: it.name,
          allocation: it.planned_amount,
          linkType: it.link_type as LinkType | null,
          linkId: it.link_id,
          // Preserve durable identity when capturing a budget as a template.
          templateItemId: it.template_item_id ?? null,
          // The real budget_items row this form item mirrors — needed to stamp
          // template identity back onto it (and its merchant rules) on save.
          sourceItemId: it.id,
        })),
      });
    }
    setTotalBudget(budget?.total_budget ? String(budget.total_budget) : "");
    setCategories(setupCats);
    setSaveAsTemplate(true);
    setTemplateName("");
    setStep(2);
  }

  // Enter "edit existing template" mode from the step-1 picker.
  function enterEditTemplate(t: BudgetTemplate) {
    haptic.selection();
    setSelectedTemplate(t);
    setEditingTemplateId(t.id);
    setInternalMode("editTemplate");
    const budget = existingTotalBudget > 0 ? existingTotalBudget : 0;
    setTotalBudget(budget > 0 ? String(budget) : "");
    setCategories(templateToCategories(t, budget));
    setSaveAsTemplate(true);
    setTemplateName(t.name);
    setError("");
    setStep(2);
  }

  // Build the template payload from current step-2 state (shared by all modes).
  function buildTemplatePayload(): SaveTemplateInput {
    // "saveTemplate" captures an EXISTING budget — its durable id must match
    // what gets stamped onto the underlying budget_items row (sourceItemId),
    // not the ephemeral form-item id. Every other mode has no pre-existing row
    // to align with, so the row's own id is a fine fallback.
    const durableId =
      internalMode === "saveTemplate" ? saveTemplateDurableId : itemTemplateItemId;
    return {
      name: templateName.trim(),
      description: selectedTemplate?.description?.trim() || "Custom template",
      preview: categories.map((c) => c.name).slice(0, 4),
      categories: categories.map((c) => ({
        name: c.name,
        icon: c.icon,
        allocationPct:
          totalBudgetNum > 0 && c.allocation > 0
            ? Math.round((c.allocation / totalBudgetNum) * 100)
            : null,
        items: c.items.map((i) => ({
          name: i.name,
          // Same durable id the budget items are stamped with — keeps a saved
          // template aligned with the budget it was captured from.
          templateItemId: durableId(i),
          plannedAmount: i.allocation > 0 ? i.allocation : undefined,
          linkType: i.linkType ?? undefined,
          linkId: i.linkId ?? undefined,
        })),
      })),
    };
  }

  // Focus total budget input on step 2
  useEffect(() => {
    if (step === 2) {
      const t = setTimeout(() => totalBudgetRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [step]);

  const totalBudgetNum = parseFloat(totalBudget) || 0;
  const totalAllocated = categories.reduce((s, c) => s + c.allocation, 0);
  const leftToAllocate = totalBudgetNum - totalAllocated;
  const allocPct =
    totalBudgetNum > 0
      ? Math.min(100, Math.round((totalAllocated / totalBudgetNum) * 100))
      : 0;
  const isOverAllocated = leftToAllocate < 0;

  function pickTemplate(template: BudgetTemplate) {
    haptic.selection();
    setSelectedTemplate(template);
    const budget =
      existingTotalBudget > 0 ? existingTotalBudget : totalBudgetNum;
    setTotalBudget(budget > 0 ? String(budget) : "");
    setCategories(templateToCategories(template, budget));
    setSaveAsTemplate(false);
    setTemplateName("");
    setError("");
    setStep(2);
  }

  function handleTotalBudgetChange(val: string) {
    setTotalBudget(val);
    const num = parseFloat(val) || 0;
    setCategories((prev) => recalcPercentageAllocations(prev, num));
  }

  function updateCategoryName(id: string, name: string) {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c))
    );
  }

  function updateCategoryAllocation(id: string, val: string) {
    const num = parseFloat(val) || 0;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, allocation: num, allocationPct: null } : c
      )
    );
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

  function addItem(catId: string, name: string, allocation: number) {
    if (!name.trim()) return;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? {
              ...c,
              items: [
                ...c.items,
                { id: crypto.randomUUID(), name: name.trim(), allocation },
              ],
            }
          : c
      )
    );
  }

  function removeItem(catId: string, itemId: string) {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? { ...c, items: c.items.filter((i) => i.id !== itemId) }
          : c
      )
    );
  }

  function updateItemAllocation(catId: string, itemId: string, val: string) {
    const num = parseFloat(val) || 0;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? {
              ...c,
              items: c.items.map((i) =>
                i.id === itemId ? { ...i, allocation: num } : i
              ),
            }
          : c
      )
    );
  }

  function updateItemName(catId: string, itemId: string, name: string) {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? {
              ...c,
              items: c.items.map((i) =>
                i.id === itemId ? { ...i, name } : i
              ),
            }
          : c
      )
    );
  }

  async function handleDeleteUserTemplate(id: string) {
    haptic.heavy();
    // Optimistic remove; refetch reconciles on failure.
    setUserTemplates((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteBudgetTemplate(id);
    } catch {
      setUserTemplates(await getBudgetTemplates().catch(() => []));
    }
  }

  async function handleCreate() {
    if (categories.length === 0) {
      setError("Add at least one category to continue.");
      haptic.error();
      return;
    }

    // Template-only modes: persist the template, no budget writes.
    if (isTemplateMode) {
      if (!templateName.trim()) {
        setError("Give the template a name.");
        haptic.error();
        return;
      }
      setIsCreating(true);
      setError("");
      try {
        if (internalMode === "editTemplate" && editingTemplateId) {
          await updateBudgetTemplate(editingTemplateId, buildTemplatePayload());
        } else if (internalMode === "saveTemplate") {
          // Saving an EXISTING budget as a template: mint the template id here
          // (rather than letting the server assign one) so the same id can be
          // stamped onto this month's budget/items/rules below — that's what
          // lets next month's budget (created from this template) resolve the
          // rules learned this month. See lib/sms/resolveRuleItem.ts.
          const templateId = crypto.randomUUID();
          await saveBudgetTemplate(buildTemplatePayload(), templateId);

          const db = getDB();
          const stampItems: StampTemplateInput["items"] = [];

          // Single rw transaction: stamp the budget, each source item, and any
          // merchant rules learned against those items, all-or-nothing.
          await db.transaction(
            "rw",
            [db.budgets, db.budget_items, db.merchant_rules],
            async () => {
              await db.budgets.update(budgetId, { template_id: templateId });

              const allRules = await db.merchant_rules.toArray();
              for (const cat of categories) {
                for (const item of cat.items) {
                  if (!item.sourceItemId) continue;
                  const durableId = saveTemplateDurableId(item);
                  stampItems.push({
                    itemId: item.sourceItemId,
                    templateItemId: durableId,
                  });
                  await db.budget_items.update(item.sourceItemId, {
                    template_id: templateId,
                    template_item_id: durableId,
                  });
                  for (const rule of allRules) {
                    if (rule.budget_item_id !== item.sourceItemId) continue;
                    await db.merchant_rules.update(rule.id, {
                      template_id: templateId,
                      template_item_id: durableId,
                    });
                  }
                }
              }
            }
          );

          // Always enqueue, even with zero items — the budget's own
          // template_id stamp (written unconditionally above) must sync
          // regardless of whether there's an item breakdown to carry along.
          await enqueue({
            table: "budgets",
            operation: "STAMP_TEMPLATE",
            recordId: budgetId,
            payload: {
              budgetId,
              templateId,
              items: stampItems,
            },
          });

          // Re-apply any SMS that landed pending before the rules carried
          // durable identity — best-effort, same pattern as the create path.
          try {
            await reapplyRulesToPending({ enqueue });
          } catch {
            /* best-effort — manual allocation still available */
          }
          try {
            await pushSmsMirrorToNative();
          } catch {
            /* best-effort */
          }
        } else {
          await saveBudgetTemplate(buildTemplatePayload());
        }
        haptic.success();
        onDone();
        onClose();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Couldn't save the template."
        );
        haptic.error();
      } finally {
        setIsCreating(false);
      }
      return;
    }

    if (isOverAllocated) {
      setError(
        `Category allocations exceed the total budget by ${fmt(Math.abs(leftToAllocate))}.`
      );
      haptic.error();
      return;
    }

    setIsCreating(true);
    setError("");

    try {
      const db = getDB();
      const now = new Date().toISOString();

      // The template identity this budget anchors to, so SMS rules re-allocate
      // across months. Saving as a (new) template mints a client id shared with
      // saveBudgetTemplate; otherwise anchor to the picked template; manual
      // budgets stay null. See lib/sms/resolveRuleItem.ts.
      const willSaveTemplate = saveAsTemplate && !!templateName.trim();
      const savedTemplateId = willSaveTemplate ? crypto.randomUUID() : null;
      const budgetTemplateId =
        savedTemplateId ?? selectedTemplate?.id ?? null;

      // 1. Optimistic IDB write for total + cats + items
      if (totalBudgetNum > 0) {
        await db.budgets.update(budgetId, {
          total_budget: totalBudgetNum,
          template_id: budgetTemplateId,
          updated_at: now,
        });
      } else {
        await db.budgets.update(budgetId, { template_id: budgetTemplateId });
      }

      const bulkCategories: Array<{
        tempId: string;
        name: string;
        icon: string | null;
        type: "misc";
        allocated_amount: number;
        items: Array<{
          tempId: string;
          name: string;
          planned: number;
          linkType: LinkType | null;
          linkId: string | null;
          templateItemId: string | null;
        }>;
      }> = [];

      for (const cat of categories) {
        const catName = cat.name.trim();
        if (!catName) continue;

        const catTempId = `temp_${crypto.randomUUID()}`;
        await db.categories.add({
          id: catTempId,
          budget_id: budgetId,
          user_id: "__pending__",
          name: catName,
          color: null,
          icon: cat.icon,
          type: "misc",
          allocated_amount: cat.allocation,
          created_at: now,
          updated_at: now,
        });

        const itemPayloads: Array<{
          tempId: string;
          name: string;
          planned: number;
          linkType: LinkType | null;
          linkId: string | null;
          templateItemId: string | null;
        }> = [];

        for (const item of cat.items) {
          const itemName = item.name.trim();
          if (!itemName) continue;

          const itemTempId = `temp_${crypto.randomUUID()}`;
          const itemPlanned = item.allocation > 0 ? item.allocation : 0;
          const linkType = item.linkType ?? null;
          const linkId = item.linkId ?? null;
          const templateItemId = budgetTemplateId
            ? itemTemplateItemId(item)
            : null;
          await db.budget_items.add({
            id: itemTempId,
            category_id: catTempId,
            user_id: "__pending__",
            name: itemName,
            emoji: null,
            planned_amount: itemPlanned,
            actual_amount: 0,
            is_completed: false,
            notes: null,
            link_type: linkType,
            link_id: linkId,
            template_id: templateItemId ? budgetTemplateId : null,
            template_item_id: templateItemId,
            overspend_count: 0,
            created_at: now,
            updated_at: now,
          });
          itemPayloads.push({
            tempId: itemTempId,
            name: itemName,
            planned: itemPlanned,
            linkType,
            linkId,
            templateItemId,
          });
        }

        bulkCategories.push({
          tempId: catTempId,
          name: catName,
          icon: cat.icon,
          type: "misc",
          allocated_amount: cat.allocation,
          items: itemPayloads,
        });
      }

      // 2. Single bulk enqueue — server does 3 round trips total
      if (bulkCategories.length > 0 || totalBudgetNum > 0) {
        await enqueue({
          table: "budgets",
          operation: "BULK_SETUP",
          recordId: budgetId,
          payload: {
            budgetId,
            totalBudget: totalBudgetNum,
            templateId: budgetTemplateId,
            categories: bulkCategories,
          },
        });
      }

      // 3. Save as template if requested — reuse the same id the budget anchors
      //    to so reusing this template next month re-stamps the same identity.
      if (willSaveTemplate) {
        await saveBudgetTemplate(buildTemplatePayload(), savedTemplateId);
      }

      // 4. Now that this month's items exist (with durable template ids), re-apply
      //    any SMS that landed pending because the budget didn't exist yet — they
      //    auto-allocate to the matching item. Best-effort. resolveRuleItem.ts.
      if (budgetTemplateId) {
        try {
          await reapplyRulesToPending({ enqueue });
        } catch {
          /* best-effort — manual allocation still available */
        }
      }

      // Freshly-created items/rules mean the native mirror is stale the moment
      // this budget exists — re-push so closed-app notifications use this
      // month's numbers right away instead of waiting for the next foreground.
      try {
        await pushSmsMirrorToNative();
      } catch {
        /* best-effort */
      }

      haptic.success();
      onDone();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't create the budget."
      );
      haptic.error();
    } finally {
      setIsCreating(false);
    }
  }

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
          aria-describedby="setup-description"
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card focus:outline-none sheet-3q"
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="mx-auto w-9 h-1 bg-border rounded-full" />
          </div>

          {/* ── Step 1: Template picker ──────────────────────── */}
          {step === 1 && (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="px-5 pt-3 pb-4 shrink-0">
                <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground">
                  Set up budget
                </Drawer.Title>
                <p
                  id="setup-description"
                  className="mt-1 text-sm text-muted-foreground"
                >
                  Pick a template to get started
                </p>
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-5 space-y-6 pb-8">
                {/* Predefined templates */}
                <div className="grid grid-cols-2 gap-3">
                  {PREDEFINED_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pickTemplate(t)}
                      className="text-left rounded-2xl bg-tile p-4 ring-1 ring-transparent active:ring-2 active:ring-[var(--accent-strong)] transition-all"
                    >
                      <p className="text-sm font-bold text-foreground mb-1">
                        {t.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
                        {t.description}
                      </p>
                      {t.preview.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {t.preview.slice(0, 3).map((p) => (
                            <span
                              key={p}
                              className="text-[10px] bg-chip rounded-full px-2 py-0.5 text-muted-foreground"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/60 italic">
                          No preset categories
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* User saved templates */}
                {userTemplates.length > 0 && (
                  <div>
                    <p className="t-label text-muted-foreground mb-3">
                      My Templates
                    </p>
                    <div className="space-y-2">
                      {userTemplates.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 rounded-2xl bg-tile px-4 py-3"
                        >
                          <button
                            type="button"
                            onClick={() => pickTemplate(t)}
                            className="flex-1 text-left"
                          >
                            <p className="text-sm font-semibold text-foreground">
                              {t.name}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {t.preview.slice(0, 4).map((p) => (
                                <span
                                  key={p}
                                  className="text-[10px] bg-chip rounded-full px-2 py-0.5 text-muted-foreground"
                                >
                                  {p}
                                </span>
                              ))}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => enterEditTemplate(t)}
                            className="text-muted-foreground hover:text-accent-strong transition-colors shrink-0"
                            aria-label="Edit template"
                          >
                            <span className="material-symbols-outlined text-base">
                              edit
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUserTemplate(t.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                            aria-label="Delete template"
                          >
                            <span className="material-symbols-outlined text-base">
                              delete
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Configure ────────────────────────────── */}
          {step === 2 && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Header */}
              <div className="px-5 pt-3 pb-4 shrink-0 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    // saveTemplate opens straight at step 2 — back closes.
                    if (internalMode === "saveTemplate") {
                      onClose();
                    } else {
                      setInternalMode("create");
                      setEditingTemplateId(null);
                      setStep(1);
                    }
                  }}
                  className="flex items-center justify-center size-9 rounded-full bg-tile active:bg-muted transition-colors shrink-0"
                >
                  <span className="material-symbols-outlined text-base">
                    arrow_back
                  </span>
                </button>
                <div>
                  <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground">
                    {internalMode === "saveTemplate"
                      ? "Save as template"
                      : internalMode === "editTemplate"
                        ? "Edit template"
                        : (selectedTemplate?.name ?? "Custom Setup")}
                  </Drawer.Title>
                  <p id="setup-description" className="sr-only">
                    Configure your budget categories and allocations
                  </p>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5 pb-8">
                {/* Total Budget */}
                <div>
                  <label className="t-label text-muted-foreground">
                    Total Budget <CurrencySymbol className="currency-symbol" />
                  </label>
                  <input
                    ref={totalBudgetRef}
                    type="number"
                    inputMode="decimal"
                    value={totalBudget}
                    onChange={(e) => handleTotalBudgetChange(e.target.value)}
                    placeholder="e.g. 50000"
                    className="mt-2 w-full rounded-[13px] border border-border bg-card px-4 py-3 text-lg font-bold text-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
                    min="0"
                  />

                  {/* Allocation tracker */}
                  {totalBudgetNum > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-200 ${
                            isOverAllocated ? "bg-neg" : "bg-accent-strong"
                          }`}
                          style={{ width: `${allocPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
                        <span>
                          <CurrencyText value={totalAllocated} /> allocated
                        </span>
                        <span
                          className={
                            isOverAllocated
                              ? "text-neg font-semibold"
                              : "text-accent-strong font-semibold"
                          }
                        >
                          {isOverAllocated
                            ? (
                                <>
                                  <CurrencyText value={Math.abs(leftToAllocate)} />{" "}
                                  over
                                </>
                              )
                            : (
                                <>
                                  <CurrencyText value={leftToAllocate} /> left
                                </>
                              )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Category list */}
                <div className="space-y-3">
                  <p className="t-label text-muted-foreground">
                    Categories
                  </p>

                  {categories.map((cat) => (
                    <CategoryCard
                      key={cat.id}
                      category={cat}
                      onNameChange={(v) => updateCategoryName(cat.id, v)}
                      onAllocationChange={(v) =>
                        updateCategoryAllocation(cat.id, v)
                      }
                      onRemove={() => removeCategory(cat.id)}
                      onAddItem={(name, allocation) =>
                        addItem(cat.id, name, allocation)
                      }
                      onRemoveItem={(itemId) => removeItem(cat.id, itemId)}
                      onUpdateItemName={(itemId, name) =>
                        updateItemName(cat.id, itemId, name)
                      }
                      onUpdateItemAllocation={(itemId, val) =>
                        updateItemAllocation(cat.id, itemId, val)
                      }
                    />
                  ))}

                  {/* Add category row */}
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
                      className="text-muted-foreground hover:text-accent-strong disabled:opacity-30 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg">
                        add_circle
                      </span>
                    </button>
                  </div>
                </div>

                {/* Template name / Save-as-template */}
                {isTemplateMode ? (
                  <div className="space-y-2">
                    <label className="t-label text-muted-foreground">
                      Template name
                    </label>
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="Template name…"
                      className="w-full rounded-[13px] border border-border bg-card px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => {
                        haptic.selection();
                        setSaveAsTemplate((v) => !v);
                      }}
                      className={`flex items-center gap-3 w-full rounded-2xl px-4 py-3 transition-all ${
                        saveAsTemplate
                          ? "bg-accent ring-2 ring-[var(--accent-strong)]"
                          : "bg-tile"
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-xl ${
                          saveAsTemplate
                            ? "text-[var(--accent-ink)]"
                            : "text-muted-foreground"
                        }`}
                        style={{
                          fontVariationSettings: saveAsTemplate
                            ? "'FILL' 1"
                            : "'FILL' 0",
                        }}
                      >
                        bookmark
                      </span>
                      <span
                        className={`text-sm font-semibold ${
                          saveAsTemplate ? "text-[var(--accent-ink)]" : "text-foreground"
                        }`}
                      >
                        Save as template
                      </span>
                    </button>

                    {saveAsTemplate && (
                      <input
                        type="text"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Template name…"
                        className="w-full rounded-[13px] border border-border bg-card px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
                      />
                    )}
                  </div>
                )}

                {error ? (
                  <p className="text-xs text-neg">{error}</p>
                ) : null}

                {/* Primary action */}
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={isCreating || categories.length === 0}
                  className="w-full h-[48px] rounded-pill bg-[var(--pill)] px-4 text-sm font-bold text-[var(--pill-foreground)] disabled:opacity-50 active:scale-[0.98] transition-all"
                >
                  {isCreating
                    ? internalMode === "create"
                      ? "Creating…"
                      : "Saving…"
                    : internalMode === "editTemplate"
                      ? "Update template"
                      : internalMode === "saveTemplate"
                        ? "Save template"
                        : "Create Budget"}
                </button>
              </div>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// ─── Category card in setup step 2 ───────────────────────────────────────────

interface CategoryCardProps {
  category: SetupCategory;
  onNameChange: (v: string) => void;
  onAllocationChange: (v: string) => void;
  onRemove: () => void;
  onAddItem: (name: string, allocation: number) => void;
  onRemoveItem: (itemId: string) => void;
  onUpdateItemName: (itemId: string, name: string) => void;
  onUpdateItemAllocation: (itemId: string, val: string) => void;
}

function CategoryCard({
  category,
  onNameChange,
  onAllocationChange,
  onRemove,
  onAddItem,
  onRemoveItem,
  onUpdateItemName,
  onUpdateItemAllocation,
}: CategoryCardProps) {
  const [newItemName, setNewItemName] = useState("");
  const [newItemAlloc, setNewItemAlloc] = useState("");

  function submitItem() {
    const trimmed = newItemName.trim();
    if (!trimmed) return;
    const num = parseFloat(newItemAlloc) || 0;
    onAddItem(trimmed, num);
    setNewItemName("");
    setNewItemAlloc("");
  }

  const itemsTotal = category.items.reduce((s, i) => s + (i.allocation || 0), 0);
  const itemsExceed =
    category.allocation > 0 && itemsTotal > category.allocation;

  return (
    <div className="rounded-2xl bg-tile p-4 space-y-3">
      {/* Name + allocation + delete */}
      <div className="flex items-center gap-2">
        {category.icon ? (
          <span className="text-base shrink-0">{category.icon}</span>
        ) : null}
        <input
          type="text"
          value={category.name}
          onChange={(e) => onNameChange(e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Category name"
        />
        <div className="flex items-center gap-1 shrink-0">
          <CurrencySymbol className="currency-symbol text-muted-foreground" />
          <input
            type="number"
            inputMode="decimal"
            value={category.allocation > 0 ? String(category.allocation) : ""}
            onChange={(e) => onAllocationChange(e.target.value)}
            placeholder="0"
            className="w-20 bg-transparent text-sm font-semibold text-foreground text-right outline-none placeholder:text-muted-foreground"
            min="0"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      {/* Items as editable rows */}
      {category.items.length > 0 && (
        <div className="space-y-1.5">
          {category.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-tile bg-chip px-3 py-1.5"
            >
              <input
                type="text"
                value={item.name}
                onChange={(e) => onUpdateItemName(item.id, e.target.value)}
                placeholder="Item name"
                className="flex-1 min-w-0 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
              {item.linkType ? (
                <span
                  className="material-symbols-outlined text-[13px] text-muted-foreground shrink-0"
                  title={`Linked to ${item.linkType}`}
                  aria-label={`Linked to ${item.linkType}`}
                >
                  link
                </span>
              ) : null}
              <div className="flex items-center gap-1 shrink-0">
                <CurrencySymbol className="currency-symbol text-[11px] text-muted-foreground" />
                <input
                  type="number"
                  inputMode="decimal"
                  value={item.allocation > 0 ? String(item.allocation) : ""}
                  onChange={(e) =>
                    onUpdateItemAllocation(item.id, e.target.value)
                  }
                  placeholder="0"
                  className="w-16 bg-transparent text-xs font-medium text-foreground text-right outline-none placeholder:text-muted-foreground"
                  min="0"
                />
              </div>
              <button
                type="button"
                onClick={() => onRemoveItem(item.id)}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-[14px]">
                  close
                </span>
              </button>
            </div>
          ))}
          {/* Items sum vs category allocation */}
          {category.allocation > 0 && (
            <p
              className={`text-[10px] tabular-nums px-1 ${
                itemsExceed ? "text-neg font-medium" : "text-muted-foreground"
              }`}
            >
              items: <CurrencyText value={itemsTotal} /> /{" "}
              <CurrencyText value={category.allocation} />
              {itemsExceed ? " · over" : null}
            </p>
          )}
        </div>
      )}

      {/* Add item inline (name + amount) */}
      <div className="flex items-center gap-2 border-t border-border pt-2">
        <input
          type="text"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitItem();
          }}
          placeholder="Add item…"
          className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
        />
        <div className="flex items-center gap-1 shrink-0">
          <CurrencySymbol className="currency-symbol text-[11px] text-muted-foreground" />
          <input
            type="number"
            inputMode="decimal"
            value={newItemAlloc}
            onChange={(e) => setNewItemAlloc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitItem();
            }}
            placeholder="0"
            className="w-16 bg-transparent text-xs font-medium text-foreground text-right outline-none placeholder:text-muted-foreground"
            min="0"
          />
        </div>
        <button
          type="button"
          onClick={submitItem}
          disabled={!newItemName.trim()}
          className="text-muted-foreground hover:text-accent-strong disabled:opacity-30 transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-base">add</span>
        </button>
      </div>
    </div>
  );
}
