"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Link2, Trash2, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { useFormatCurrency } from "@/lib/hooks/useFormatCurrency";
import { InlineEditableText } from "@/components/ui/InlineEditableText";
import { InlineEditableNumber } from "@/components/ui/InlineEditableNumber";
import { Card } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import EmojiPickerModal from "@/components/ui/EmojiPickerModal";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { resolveColor, type CatKey } from "@/lib/theme/dataViz";
import { ConfirmDrawer } from "@/components/ui/ConfirmDrawer";
import { ItemDetailSheet, NEW_ITEM_ID } from "@/components/budget/ItemDetailSheet";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useCategoryData, categoryDataKey } from "@/lib/hooks/useCategoryData";
import { budgetKey } from "@/lib/hooks/useBudget";
import { DASHBOARD_KEY } from "@/lib/hooks/useDashboard";
import { useEnqueue } from "@/lib/hooks/useSync";
import { getDB } from "@/lib/db";
import { computeAutoCompletion } from "@/lib/utils/budget-completion";
import { applyLinkedSpendCascadeIDB } from "@/lib/utils/budget-cascade";
import { NET_WORTH_KEY } from "@/lib/hooks/useNetWorth";
import { GOALS_KEY } from "@/lib/hooks/useGoals";
import { DEBT_KEY } from "@/lib/hooks/useDebt";

type LinkType = "asset" | "debt";

interface BudgetItem {
  id: string;
  name: string;
  emoji?: string | null;
  planned: number;
  actual: number;
  is_completed: boolean;
  notes: string | null;
  link_type?: LinkType | null;
  link_id?: string | null;
}

interface LinkTargetEntry {
  id: string;
  name: string;
  icon?: string | null;
}

function SegBar({ pct, over, color }: { pct: number; over?: boolean; color?: string }) {
  return (
    <Progress
      value={pct * 100}
      state={over ? "over" : "normal"}
      color={over ? undefined : color}
      className="mt-2 h-1.5"
    />
  );
}

export default function CategoryDetailPage({ categoryId }: { categoryId: string }) {
  const { data, isLoading } = useCategoryData(categoryId);

  if (isLoading) {
    return (
      <div className="flex flex-col animate-pulse px-4 pt-4 gap-3">
        <div className="h-9 bg-muted rounded-xl w-40" />
        <div className="h-28 bg-muted rounded-card" />
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 bg-muted rounded-card" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;
  return <CategoryDetailContent categoryId={categoryId} data={data} />;
}

interface CategoryData {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  type?: "needs" | "wants" | "investments" | "misc" | null;
  categoryAllocation: number;
  totalBudget: number;
  otherAllocated: number;
  items: BudgetItem[];
}

function CategoryDetailContent({
  categoryId,
  data,
}: {
  categoryId: string;
  data: CategoryData;
}) {
  const router = useRouter();
  const haptic = useHaptic();
  const qc = useQueryClient();
  const enqueue = useEnqueue();
  const fmt = useFormatCurrency();

  const [items, setItems] = useState<BudgetItem[]>(data.items);
  const [icon, setIcon] = useState(data.icon || null);
  const [color, setColor] = useState<CatKey | null>((data.color as CatKey | null) ?? null);
  const [name, setName] = useState(data.name);
  const [categoryAllocation, setCategoryAllocation] = useState(data.categoryAllocation);
  const [selectedItem, setSelectedItem] = useState<BudgetItem | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [linkTargets, setLinkTargets] = useState<{
    assets: LinkTargetEntry[];
    debts: LinkTargetEntry[];
  }>({ assets: [], debts: [] });
  const [allAssets, setAllAssets] = useState<LinkTargetEntry[]>([]);

  useEffect(() => {
    const db = getDB();
    let cancelled = false;
    (async () => {
      const [assets, debts] = await Promise.all([
        db.assets.toArray(),
        db.debts.toArray(),
      ]);
      if (cancelled) return;
      // Achieved goal-assets aren't valid link targets
      const activeAssets = assets.filter((a) => !a.achieved_at);
      const allAssetEntries = activeAssets.map((a) => ({
        id: a.id,
        name: a.is_goal ? `🎯 ${a.name}` : a.name,
        icon: a.icon,
      }));
      setAllAssets(allAssetEntries);
      setLinkTargets({
        assets: allAssetEntries,
        debts: debts.map((d) => ({ id: d.id, name: d.name, icon: d.icon })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedItem]);

  const totalPlanned = items.reduce((s, i) => s + i.planned, 0);
  const totalActual = items.reduce((s, i) => s + i.actual, 0);
  const left = categoryAllocation - totalActual;
  const pct =
    categoryAllocation > 0
      ? Math.min(1, totalActual / categoryAllocation)
      : 0;

  const remainingBudgetCapacity = data.totalBudget - data.otherAllocated - categoryAllocation;

  function getCategoryAllocationError(nextAllocation: number) {
    const nextTotal = data.otherAllocated + nextAllocation;
    if (nextTotal <= data.totalBudget || nextTotal <= data.otherAllocated + categoryAllocation) return "";
    if (data.totalBudget <= 0) return "Set the Total Budget on the budget page before allocating category budgets.";
    return `Exceeds the total budget by ${fmt(nextTotal - data.totalBudget)}.`;
  }

  function getItemAllocationError(nextItemsTotal: number) {
    if (categoryAllocation <= 0) return "";
    if (nextItemsTotal > categoryAllocation) {
      return `Items exceed category budget of ${fmt(categoryAllocation)} by ${fmt(nextItemsTotal - categoryAllocation)}.`;
    }
    return "";
  }

  function invalidateBudgetCaches() {
    getDB().categories.get(categoryId).then((cat) => {
      if (!cat) return;
      return getDB().budgets.get(cat.budget_id).then((budget) => {
        if (!budget) return;
        qc.invalidateQueries({ queryKey: budgetKey(budget.month, budget.year) });
      });
    }).catch(() => {});
    qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    qc.invalidateQueries({ queryKey: categoryDataKey(categoryId) });
  }

  async function handleAddItem(data: {
    name: string;
    emoji?: string | null;
    planned_amount: number;
    actual_amount: number;
    is_completed: boolean;
    notes: string | null;
    link_type?: LinkType | null;
    link_id?: string | null;
  }) {
    const trimmedName = data.name.trim();
    if (!trimmedName) return;
    haptic.success();
    const tempId = `temp_${crypto.randomUUID()}`;
    const linkType = data.link_type ?? null;
    const linkId = data.link_id ?? null;
    const emoji = data.emoji ?? null;
    const newItem: BudgetItem = {
      id: tempId,
      name: trimmedName,
      emoji,
      planned: data.planned_amount,
      actual: data.actual_amount,
      is_completed: data.is_completed,
      notes: data.notes,
      link_type: linkType,
      link_id: linkId,
    };
    setItems((prev) => [...prev, newItem]);
    setValidationError("");
    try {
      const db = getDB();
      const now = new Date().toISOString();
      await db.budget_items.add({
        id: tempId,
        category_id: categoryId,
        user_id: "__pending__",
        name: trimmedName,
        emoji,
        planned_amount: data.planned_amount,
        actual_amount: data.actual_amount,
        is_completed: data.is_completed,
        notes: data.notes,
        link_type: linkType,
        link_id: linkId,
        created_at: now,
        updated_at: now,
      });
      await enqueue({
        table: "budget_items",
        operation: "INSERT",
        recordId: tempId,
        tempId,
        payload: {
          categoryId,
          name: trimmedName,
          emoji,
          planned: data.planned_amount,
          actual: data.actual_amount,
          is_completed: data.is_completed,
          notes: data.notes,
          link: linkType && linkId ? { link_type: linkType, link_id: linkId } : null,
        },
      });
      invalidateBudgetCaches();
    } catch {
      haptic.error();
      setItems((prev) => prev.filter((item) => item.id !== tempId));
      setValidationError("Couldn't add the item right now.");
    }
  }

  async function handleUpdateItem(
    id: string,
    updates: {
      name?: string;
      emoji?: string | null;
      planned_amount?: number;
      actual_amount?: number;
      is_completed?: boolean;
      notes?: string | null;
      link_type?: LinkType | null;
      link_id?: string | null;
    }
  ) {
    const previousItems = items;
    const targetItem = items.find((i) => i.id === id);
    const finalUpdates = { ...updates };
    if (
      targetItem &&
      updates.actual_amount !== undefined &&
      updates.is_completed === undefined
    ) {
      const planned =
        updates.planned_amount !== undefined
          ? updates.planned_amount
          : targetItem.planned;
      finalUpdates.is_completed = computeAutoCompletion(
        planned,
        updates.actual_amount,
        targetItem.is_completed
      );
    }

    const nextItems = items.map((item) =>
      item.id === id
        ? {
            ...item,
            ...(finalUpdates.name !== undefined ? { name: finalUpdates.name } : {}),
            ...(finalUpdates.emoji !== undefined ? { emoji: finalUpdates.emoji } : {}),
            ...(finalUpdates.planned_amount !== undefined ? { planned: finalUpdates.planned_amount } : {}),
            ...(finalUpdates.actual_amount !== undefined ? { actual: finalUpdates.actual_amount } : {}),
            ...(finalUpdates.is_completed !== undefined ? { is_completed: finalUpdates.is_completed } : {}),
            ...(finalUpdates.notes !== undefined ? { notes: finalUpdates.notes } : {}),
            ...(finalUpdates.link_type !== undefined ? { link_type: finalUpdates.link_type } : {}),
            ...(finalUpdates.link_id !== undefined ? { link_id: finalUpdates.link_id } : {}),
          }
        : item
    );

    if (finalUpdates.planned_amount !== undefined) {
      const nextTotal = nextItems.reduce((s, i) => s + i.planned, 0);
      const errMsg = getItemAllocationError(nextTotal);
      if (errMsg) {
        haptic.error();
        setValidationError(errMsg);
        return;
      }
    }

    setValidationError("");
    setItems(nextItems);

    const idbUpdates: Record<string, string | number | boolean | null> = {};
    if (finalUpdates.name !== undefined) idbUpdates.name = finalUpdates.name;
    if (finalUpdates.emoji !== undefined) idbUpdates.emoji = finalUpdates.emoji;
    if (finalUpdates.planned_amount !== undefined) idbUpdates.planned_amount = finalUpdates.planned_amount;
    if (finalUpdates.actual_amount !== undefined) idbUpdates.actual_amount = finalUpdates.actual_amount;
    if (finalUpdates.is_completed !== undefined) idbUpdates.is_completed = finalUpdates.is_completed;
    if (finalUpdates.notes !== undefined) idbUpdates.notes = finalUpdates.notes;
    if ((finalUpdates as { link_type?: unknown }).link_type !== undefined) {
      idbUpdates.link_type = (finalUpdates as { link_type: string | null }).link_type;
    }
    if ((finalUpdates as { link_id?: unknown }).link_id !== undefined) {
      idbUpdates.link_id = (finalUpdates as { link_id: string | null }).link_id;
    }
    idbUpdates.updated_at = new Date().toISOString();

    try {
      const db = getDB();
      const existing = await db.budget_items.get(id);
      let cascade = { touchedNetWorth: false, touchedGoals: false, touchedDebt: false };
      if (existing) {
        cascade = await applyLinkedSpendCascadeIDB(existing, {
          actual_amount: finalUpdates.actual_amount,
          link_type: (finalUpdates as { link_type?: "asset" | "debt" | null }).link_type,
          link_id: (finalUpdates as { link_id?: string | null }).link_id,
        });
      }
      await db.budget_items.update(id, idbUpdates);
      await enqueue({
        table: "budget_items",
        operation: "UPDATE",
        recordId: id,
        payload: { itemId: id, updates: finalUpdates },
      });
      invalidateBudgetCaches();
      // Force refetch on every actual_amount change. Even if the cascade
      // helper returned no flags (e.g. legacy 'goal' link_type that the IDB
      // upgrade hasn't rewritten yet), the server-side cascade may have run
      // — so we need to make sure cross-section views pick up fresh state
      // on next mount without a hard page refresh.
      if (finalUpdates.actual_amount !== undefined) {
        await qc.refetchQueries({ queryKey: NET_WORTH_KEY, type: "all" });
        await qc.refetchQueries({ queryKey: GOALS_KEY, type: "all" });
        await qc.refetchQueries({ queryKey: DEBT_KEY, type: "all" });
        await qc.refetchQueries({ queryKey: ["asset-history"], type: "all" });
      }
    } catch {
      haptic.error();
      setItems(previousItems);
      setValidationError("Couldn't update the item right now.");
    }
  }

  async function handleUpdateCategoryAllocation(newAmount: number) {
    if (newAmount < 0) return;
    const errMsg = getCategoryAllocationError(newAmount);
    if (errMsg) {
      haptic.error();
      setValidationError(errMsg);
      return;
    }
    setCategoryAllocation(newAmount);
    setValidationError("");
    try {
      const db = getDB();
      await db.categories.update(categoryId, {
        allocated_amount: newAmount,
        updated_at: new Date().toISOString(),
      });
      await enqueue({
        table: "categories",
        operation: "UPDATE",
        recordId: categoryId,
        payload: { categoryId, updates: { allocated_amount: newAmount } },
      });
      invalidateBudgetCaches();
    } catch {
      haptic.error();
      setCategoryAllocation(data.categoryAllocation);
      setValidationError("Couldn't update category budget.");
    }
  }

  async function handleUpdateIcon(newIcon: string) {
    setIcon(newIcon);
    try {
      const db = getDB();
      await db.categories.update(categoryId, { icon: newIcon, updated_at: new Date().toISOString() });
      await enqueue({ table: "categories", operation: "UPDATE", recordId: categoryId, payload: { categoryId, updates: { icon: newIcon } } });
      invalidateBudgetCaches();
    } catch {
      setIcon(data.icon || null);
    }
  }

  async function handleUpdateColor(next: CatKey | null) {
    const prev = color;
    setColor(next);
    try {
      const db = getDB();
      await db.categories.update(categoryId, { color: next, updated_at: new Date().toISOString() });
      await enqueue({ table: "categories", operation: "UPDATE", recordId: categoryId, payload: { categoryId, updates: { color: next } } });
      invalidateBudgetCaches();
    } catch {
      setColor(prev);
    }
  }

  async function handleUpdateCategoryName(newName: string) {
    if (!newName.trim()) return;
    const trimmed = newName.trim();
    setName(trimmed);
    try {
      const db = getDB();
      await db.categories.update(categoryId, { name: trimmed, updated_at: new Date().toISOString() });
      await enqueue({ table: "categories", operation: "UPDATE", recordId: categoryId, payload: { categoryId, updates: { name: trimmed } } });
      invalidateBudgetCaches();
    } catch {
      setName(data.name);
    }
  }

  async function handleDeleteCategory() {
    setIsConfirmDeleteOpen(false);
    try {
      const db = getDB();
      const itemIds = (await db.budget_items.where("category_id").equals(categoryId).toArray()).map((i) => i.id);
      await db.budget_items.bulkDelete(itemIds);
      await db.categories.delete(categoryId);
      await enqueue({ table: "categories", operation: "DELETE", recordId: categoryId, payload: { categoryId } });
      invalidateBudgetCaches();
      router.replace("/budget");
    } catch {
      setIsConfirmDeleteOpen(false);
    }
  }

  async function handleDeleteItem(id: string) {
    haptic.heavy();
    const previousItems = items;
    setItems((prev) => prev.filter((item) => item.id !== id));
    setValidationError("");
    try {
      const db = getDB();
      await db.budget_items.delete(id);
      await enqueue({ table: "budget_items", operation: "DELETE", recordId: id, payload: { itemId: id } });
      invalidateBudgetCaches();
    } catch {
      haptic.error();
      setItems(previousItems);
      setValidationError("Couldn't delete the item right now.");
    }
  }

  function openItem(item: BudgetItem) {
    haptic.selection();
    setSelectedItem(item);
  }

  const categoryColor = resolveColor({ id: categoryId, color });

  const otherItemsPlanned = selectedItem
    ? items.filter((i) => i.id !== selectedItem.id).reduce((s, i) => s + i.planned, 0)
    : 0;

  return (
    <div className="px-4 pt-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 px-1 pt-1">
        <button
          id="category-back"
          onClick={() => { haptic.light(); router.back(); }}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground"
          aria-label="Back"
        >
          <ChevronLeft size={18} strokeWidth={1.9} />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={() => { haptic.light(); setIsPickerOpen(true); }}
            className="shrink-0 text-xl leading-none"
            title="Choose Icon"
          >
            {icon || (
              <span className="material-symbols-outlined text-[20px] text-muted-foreground">add_reaction</span>
            )}
          </button>
          <h1 className="font-display text-[24px] font-bold leading-none tracking-[-0.03em] text-foreground truncate">
            <InlineEditableText
              value={name}
              onSave={handleUpdateCategoryName}
              className="font-display text-[24px] font-bold text-foreground"
            />
          </h1>
        </div>

        <button
          id="category-delete"
          onClick={() => { haptic.heavy(); setIsConfirmDeleteOpen(true); }}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-neg"
          title="Delete Category"
          aria-label="Delete Category"
        >
          <Trash2 size={17} strokeWidth={1.7} />
        </button>
      </div>

      {/* Color */}
      <Card compact className="flex items-center gap-3 flex-wrap">
        <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground shrink-0">Color</span>
        <ColorPicker value={color} onChange={handleUpdateColor} />
      </Card>

      {/* Stats card */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="t-label text-muted-foreground">
              {left < 0 ? "Over Budget" : "Left"}
            </span>
            <div
              className="figure text-[30px] mt-1"
              style={{ color: left < 0 ? "var(--neg)" : "var(--foreground)" }}
            >
              {left < 0 ? "−" : ""}
              <CurrencyText value={Math.abs(left)} />
            </div>
          </div>
          <div className="text-right">
            <span className="t-label text-muted-foreground">Budget / Spent</span>
            <div className="figure text-[15px] mt-1.5 text-foreground">
              <InlineEditableNumber
                value={categoryAllocation}
                onSave={handleUpdateCategoryAllocation}
              />
              {" / "}
              <CurrencyText value={totalActual} />
            </div>
          </div>
        </div>

        <SegBar pct={pct} over={totalActual > categoryAllocation && categoryAllocation > 0} color={categoryColor} />

        <div className="mt-2.5 space-y-1">
          <p className="text-[10.5px] font-medium text-muted-foreground tabular-nums">
            {Math.round(pct * 100)}% used · <CurrencyText value={totalPlanned} /> planned
            {categoryAllocation > 0 ? (
              <>
                {" "}·{" "}
                <CurrencyText value={Math.max(0, categoryAllocation - totalPlanned)} />{" "}
                unallocated
              </>
            ) : null}
          </p>
          <p className="text-[10.5px] font-medium text-muted-foreground tabular-nums">
            Total <CurrencyText value={data.totalBudget} /> · Other{" "}
            <CurrencyText value={data.otherAllocated} />
          </p>
          {data.totalBudget <= 0 ? (
            <button
              type="button"
              onClick={() => { haptic.light(); router.back(); }}
              className="text-[11px] font-bold text-foreground"
            >
              Set Total Budget first →
            </button>
          ) : remainingBudgetCapacity < 0 ? (
            <p className="text-[10.5px] font-medium text-neg">
              <CurrencyText value={Math.abs(remainingBudgetCapacity)} /> over total budget cap.
            </p>
          ) : null}
          {validationError && (
            <p className="text-[10.5px] font-medium text-neg">{validationError}</p>
          )}
        </div>
      </Card>

      {/* Items header */}
      <div className="flex items-center justify-between px-1 mt-1">
        <span className="font-display text-[15px] font-bold text-foreground">
          Items · {items.length}
        </span>
        <button
          id="add-item-btn"
          type="button"
          onClick={() => {
            haptic.light();
            setSelectedItem({
              id: NEW_ITEM_ID,
              name: "",
              planned: 0,
              actual: 0,
              is_completed: false,
              notes: null,
            });
          }}
          className="flex items-center gap-1 text-[13px] font-bold text-foreground"
        >
          <span className="text-accent-strong text-base leading-none">＋</span>Add
        </button>
      </div>

      {/* Item list */}
      <div className="flex flex-col gap-2.5">
        {items.map((item) => {
          const itemPct = item.planned > 0 ? Math.min(1, item.actual / item.planned) : 0;

          return (
            <Card key={item.id} compact>
              <button
                type="button"
                onClick={() => openItem(item)}
                className="w-full text-left"
              >
                <div className="flex items-center gap-3">
                  {item.is_completed ? (
                    <div
                      className="flex size-[22px] shrink-0 items-center justify-center rounded-full text-white"
                      style={{ background: categoryColor }}
                    >
                      <Check size={13} strokeWidth={2.4} />
                    </div>
                  ) : (
                    <div
                      className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] text-[15px] font-bold"
                      style={{
                        background: `color-mix(in srgb, ${categoryColor} 16%, transparent)`,
                        color: categoryColor,
                      }}
                    >
                      {item.emoji || item.name.charAt(0).toUpperCase() || "•"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-[14px] font-bold truncate ${
                        item.is_completed ? "line-through text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {item.name}
                    </div>
                    {item.link_type && item.link_id ? (
                      <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-accent-strong">
                        <Link2 size={12} strokeWidth={1.7} />
                        {(() => {
                          const target =
                            item.link_type === "asset"
                              ? allAssets.find((t) => t.id === item.link_id)
                              : linkTargets.debts.find((t) => t.id === item.link_id);
                          return target ? `${target.icon ?? ""} ${target.name}`.trim() : item.link_type;
                        })()}
                      </div>
                    ) : item.notes ? (
                      <p className="text-[10.5px] font-medium text-muted-foreground truncate mt-0.5">
                        {item.notes}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="figure text-[13px]">
                      <CurrencyText value={item.actual} />
                    </div>
                    {item.planned > 0 && (
                      <div className="text-[9.5px] font-medium text-muted-foreground tabular-nums mt-0.5">
                        of <CurrencyText value={item.planned} />
                      </div>
                    )}
                  </div>
                  <ChevronRight size={15} strokeWidth={2} className="shrink-0 text-muted-foreground" />
                </div>
                {item.planned > 0 && <SegBar pct={itemPct} over={item.actual > item.planned} color={categoryColor} />}
              </button>
            </Card>
          );
        })}
      </div>

      {/* Bottom spacer */}
      <div className="h-28 md:h-12" />

      <EmojiPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={handleUpdateIcon}
      />

      <ConfirmDrawer
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        onConfirm={handleDeleteCategory}
        title="Delete Category?"
        description="All items within this category will be deleted. This cannot be undone."
        confirmText="Delete Category"
        cancelText="Keep Category"
      />

      <ItemDetailSheet
        item={selectedItem}
        category={{ name, icon, type: data.type ?? null, allocation: categoryAllocation, otherItemsPlanned }}
        linkTargets={(() => {
          // If currently selected item already references a now-mirrored asset,
          // re-include that asset in the picker so the user can see/keep it.
          if (
            selectedItem?.link_type === "asset" &&
            selectedItem.link_id &&
            !linkTargets.assets.some((a) => a.id === selectedItem.link_id)
          ) {
            const legacy = allAssets.find((a) => a.id === selectedItem.link_id);
            if (legacy) {
              return {
                ...linkTargets,
                assets: [...linkTargets.assets, legacy],
              };
            }
          }
          return linkTargets;
        })()}
        onClose={() => setSelectedItem(null)}
        onSave={async (itemId, updates) => { await handleUpdateItem(itemId, updates); }}
        onCreate={async (formData) => { await handleAddItem(formData); }}
        onDelete={handleDeleteItem}
      />
    </div>
  );
}
