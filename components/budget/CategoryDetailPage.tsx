"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { InlineEditableText } from "@/components/ui/InlineEditableText";
import { InlineEditableNumber } from "@/components/ui/InlineEditableNumber";
import EmojiPickerModal from "@/components/ui/EmojiPickerModal";
import { ConfirmDrawer } from "@/components/ui/ConfirmDrawer";
import { ItemDetailSheet, NEW_ITEM_ID } from "@/components/budget/ItemDetailSheet";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useCategoryData, categoryDataKey } from "@/lib/hooks/useCategoryData";
import { budgetKey } from "@/lib/hooks/useBudget";
import { DASHBOARD_KEY } from "@/lib/hooks/useDashboard";
import { useEnqueue } from "@/lib/hooks/useSync";
import { getDB } from "@/lib/db";
import { computeAutoCompletion } from "@/lib/utils/budget-completion";

interface BudgetItem {
  id: string;
  name: string;
  planned: number;
  actual: number;
  is_completed: boolean;
  notes: string | null;
}

function fmt(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function SegBar({ pct, segments = 20 }: { pct: number; segments?: number }) {
  return (
    <div className="flex gap-[2px] mt-2">
      {Array.from({ length: segments }).map((_, j) => (
        <div
          key={j}
          className="flex-1"
          style={{
            height: 2,
            background: j / segments < pct ? "var(--foreground)" : "var(--progress-empty)",
          }}
        />
      ))}
    </div>
  );
}

export default function CategoryDetailPage({ categoryId }: { categoryId: string }) {
  const { data, isLoading } = useCategoryData(categoryId);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-full animate-pulse px-7 pt-14 gap-6">
        <div className="h-8 bg-muted rounded w-40" />
        <div className="h-px bg-border" />
        <div className="grid grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 bg-muted rounded" />)}
        </div>
        <div className="h-px bg-border" />
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-12 bg-muted rounded" />)}
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

  const [items, setItems] = useState<BudgetItem[]>(data.items);
  const [icon, setIcon] = useState(data.icon || null);
  const [name, setName] = useState(data.name);
  const [categoryAllocation, setCategoryAllocation] = useState(data.categoryAllocation);
  const [selectedItem, setSelectedItem] = useState<BudgetItem | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [validationError, setValidationError] = useState("");

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
    planned_amount: number;
    actual_amount: number;
    is_completed: boolean;
    notes: string | null;
  }) {
    const trimmedName = data.name.trim();
    if (!trimmedName) return;
    haptic.success();
    const tempId = `temp_${crypto.randomUUID()}`;
    const newItem: BudgetItem = {
      id: tempId,
      name: trimmedName,
      planned: data.planned_amount,
      actual: data.actual_amount,
      is_completed: data.is_completed,
      notes: data.notes,
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
        planned_amount: data.planned_amount,
        actual_amount: data.actual_amount,
        is_completed: data.is_completed,
        notes: data.notes,
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
          planned: data.planned_amount,
          actual: data.actual_amount,
          is_completed: data.is_completed,
          notes: data.notes,
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
      planned_amount?: number;
      actual_amount?: number;
      is_completed?: boolean;
      notes?: string | null;
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
            ...(finalUpdates.planned_amount !== undefined ? { planned: finalUpdates.planned_amount } : {}),
            ...(finalUpdates.actual_amount !== undefined ? { actual: finalUpdates.actual_amount } : {}),
            ...(finalUpdates.is_completed !== undefined ? { is_completed: finalUpdates.is_completed } : {}),
            ...(finalUpdates.notes !== undefined ? { notes: finalUpdates.notes } : {}),
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
    if (finalUpdates.planned_amount !== undefined) idbUpdates.planned_amount = finalUpdates.planned_amount;
    if (finalUpdates.actual_amount !== undefined) idbUpdates.actual_amount = finalUpdates.actual_amount;
    if (finalUpdates.is_completed !== undefined) idbUpdates.is_completed = finalUpdates.is_completed;
    if (finalUpdates.notes !== undefined) idbUpdates.notes = finalUpdates.notes;
    idbUpdates.updated_at = new Date().toISOString();

    try {
      const db = getDB();
      await db.budget_items.update(id, idbUpdates);
      await enqueue({
        table: "budget_items",
        operation: "UPDATE",
        recordId: id,
        payload: { itemId: id, updates: finalUpdates },
      });
      invalidateBudgetCaches();
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

  const otherItemsPlanned = selectedItem
    ? items.filter((i) => i.id !== selectedItem.id).reduce((s, i) => s + i.planned, 0)
    : 0;

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background px-7 pt-14 pb-5 flex items-center justify-between">
        <button
          id="category-back"
          onClick={() => { haptic.light(); router.back(); }}
          className="size-9 flex items-center justify-center border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0 mx-4">
          <button
            onClick={() => { haptic.light(); setIsPickerOpen(true); }}
            className="shrink-0 text-xl grayscale"
            title="Choose Icon"
          >
            {icon || (
              <span className="material-symbols-outlined text-[18px] text-muted-foreground">add_reaction</span>
            )}
          </button>
          <h1 className="font-display text-[26px] leading-none tracking-[-0.02em] text-foreground truncate">
            <InlineEditableText
              value={name}
              onSave={handleUpdateCategoryName}
              className="font-display text-[26px] text-foreground"
            />
          </h1>
        </div>

        <button
          id="category-delete"
          onClick={() => { haptic.heavy(); setIsConfirmDeleteOpen(true); }}
          className="size-9 flex items-center justify-center text-muted-foreground hover:text-red-400 transition-colors"
          title="Delete Category"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </header>

      {/* Hairline */}
      <div className="h-px bg-border mx-7" />

      <div className="md:grid md:grid-cols-[1fr_1.5fr] flex-1">
        {/* Left — stats */}
        <div className="md:border-r border-border">
          {/* Stats — Left as hero */}
          <div className="px-7 py-6 border-b border-border">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground">
                {left < 0 ? "Over Budget" : "Left"}
              </span>
              <div
                className="text-[44px] md:text-[52px] leading-[0.95] tracking-[-0.025em] tabular-nums mt-1"
                style={{ color: left < 0 ? "#ef4444" : "var(--foreground)" }}
              >
                {left < 0 ? "−" : ""}
                <CurrencyText value={Math.abs(left)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-0 mt-5 pt-4 border-t border-border">
              {/* Budget (editable) */}
              <div className="flex flex-col gap-1 pr-4 border-r border-border">
                <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground">Budget</span>
                <div className="text-[20px] leading-none tracking-[-0.02em] text-muted-foreground tabular-nums mt-1">
                  <InlineEditableNumber
                    value={categoryAllocation}
                    onSave={handleUpdateCategoryAllocation}
                  />
                </div>
                <span className="font-mono text-[9px] text-muted-foreground mt-0.5">tap to edit</span>
              </div>

              {/* Spent */}
              <div className="flex flex-col gap-1 pl-4">
                <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground">Spent</span>
                <CurrencyText
                  value={totalActual}
                  className="text-[20px] leading-none tracking-[-0.02em] text-foreground mt-1 tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="px-7 py-4 border-b border-border">
            <SegBar pct={pct} segments={30} />
            <div className="flex justify-between mt-2">
              <span className="font-mono text-[9px] text-muted-foreground">
                {Math.round(pct * 100)}% used
              </span>
              <span className="font-mono text-[9px] text-muted-foreground tabular-nums">
                <CurrencyText value={totalActual} /> /{" "}
                <CurrencyText value={categoryAllocation} />
              </span>
            </div>
          </div>

          {/* Budget context */}
          <div className="px-7 py-4 space-y-1">
            <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
              Total <CurrencyText value={data.totalBudget} /> · Other{" "}
              <CurrencyText value={data.otherAllocated} />
            </p>
            <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
              <CurrencyText value={totalPlanned} /> planned
              {categoryAllocation > 0 ? (
                <>
                  {" "}·{" "}
                  <CurrencyText
                    value={Math.max(0, categoryAllocation - totalPlanned)}
                  />{" "}
                  unplanned
                </>
              ) : null}
            </p>
            {data.totalBudget <= 0 ? (
              <button
                type="button"
                onClick={() => { haptic.light(); router.back(); }}
                className="font-mono text-[10px] text-foreground underline underline-offset-4"
              >
                Set Total Budget first →
              </button>
            ) : remainingBudgetCapacity < 0 ? (
              <p className="font-mono text-[10px] text-red-400">
                <CurrencyText value={Math.abs(remainingBudgetCapacity)} /> over
                {" "}total budget cap.
              </p>
            ) : (
              <p className="font-mono text-[10px] text-muted-foreground">
                <CurrencyText value={remainingBudgetCapacity} /> still
                {" "}unallocated.
              </p>
            )}
            {validationError && (
              <p className="font-mono text-[10px] text-red-400">{validationError}</p>
            )}
          </div>
        </div>

        {/* Right — items */}
        <div className="flex flex-col flex-1">
          {/* Items header */}
          <div className="px-7 py-4 flex justify-between items-baseline border-b border-border">
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              Items
            </span>
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              {items.length} total
            </span>
          </div>

          {/* Item list */}
          <div className="flex-1 px-7">
            {items.map((item, idx) => {
              const itemPct = item.planned > 0 ? Math.min(1, item.actual / item.planned) : 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className="w-full text-left py-4 border-b border-border active:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] text-muted-foreground shrink-0">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        {item.is_completed && (
                          <span
                            className="material-symbols-outlined text-sm text-foreground shrink-0"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            check_circle
                          </span>
                        )}
                        <span
                          className={`text-[15px] font-medium truncate ${
                            item.is_completed ? "line-through text-muted-foreground" : "text-foreground"
                          }`}
                        >
                          {item.name}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
                        <span>
                          <CurrencyText value={item.actual} /> spent
                        </span>
                        {item.planned > 0 && (
                          <span style={{ color: "var(--dimmer)" }}>
                            {" "}of <CurrencyText value={item.planned} />
                          </span>
                        )}
                      </div>
                      {item.planned > 0 && (
                        <SegBar pct={itemPct} segments={16} />
                      )}
                      {item.notes && (
                        <p className="font-mono text-[9px] text-muted-foreground truncate mt-0.5">
                          {item.notes}
                        </p>
                      )}
                    </div>
                    <span
                      className="material-symbols-outlined text-[16px] shrink-0 mt-0.5"
                      style={{ color: "var(--dimmer)" }}
                    >
                      chevron_right
                    </span>
                  </div>
                </button>
              );
            })}

            {/* Add item */}
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
              className="w-full flex items-center gap-2 py-4 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add Item
            </button>
          </div>
        </div>
      </div>

      {/* Bottom spacer */}
      <div className="h-24 md:h-8" />

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
        category={{ name, icon, allocation: categoryAllocation, otherItemsPlanned }}
        onClose={() => setSelectedItem(null)}
        onSave={async (itemId, updates) => { await handleUpdateItem(itemId, updates); }}
        onCreate={async (data) => { await handleAddItem(data); }}
        onDelete={handleDeleteItem}
      />
    </div>
  );
}
