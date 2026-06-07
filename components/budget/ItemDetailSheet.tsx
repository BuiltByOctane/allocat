"use client";

import { Drawer } from "vaul";
import { useEffect, useMemo, useRef, useState } from "react";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { CurrencySymbol } from "@/components/ui/CurrencySymbol";
import { useFormatCurrency } from "@/lib/hooks/useFormatCurrency";
import { BottomSheetSelect } from "@/components/ui/BottomSheetSelect";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { suggestLink } from "@/lib/utils/link-suggest";

export const NEW_ITEM_ID = "__new__";

export type LinkType = "asset" | "debt";

export interface LinkTarget {
  id: string;
  name: string;
  icon?: string | null;
}

interface ItemData {
  id: string;
  name: string;
  planned: number;
  actual: number;
  is_completed: boolean;
  notes: string | null;
  link_type?: LinkType | null;
  link_id?: string | null;
}

interface ItemDetailSheetProps {
  item: ItemData | null;
  category: {
    name: string;
    icon: string | null;
    type?: "needs" | "wants" | "investments" | "misc" | null;
    allocation: number;
    otherItemsPlanned: number;
  };
  linkTargets?: {
    assets: LinkTarget[];
    debts: LinkTarget[];
  };
  onClose: () => void;
  onSave: (
    itemId: string,
    updates: {
      name?: string;
      planned_amount?: number;
      actual_amount?: number;
      is_completed?: boolean;
      notes?: string | null;
      link_type?: LinkType | null;
      link_id?: string | null;
    }
  ) => Promise<void>;
  onCreate: (data: {
    name: string;
    planned_amount: number;
    actual_amount: number;
    is_completed: boolean;
    notes: string | null;
    link_type?: LinkType | null;
    link_id?: string | null;
  }) => Promise<void>;
  onDelete: (itemId: string) => void;
}

export function ItemDetailSheet({
  item,
  category,
  linkTargets,
  onClose,
  onSave,
  onCreate,
  onDelete,
}: ItemDetailSheetProps) {
  const haptic = useHaptic();
  const fmt = useFormatCurrency();
  const nameRef = useRef<HTMLInputElement>(null);
  const isNew = item?.id === NEW_ITEM_ID;

  const [name, setName] = useState("");
  const [planned, setPlanned] = useState("");
  const [actual, setActual] = useState("");
  const [isCompleted, setIsCompleted] = useState(false);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linkType, setLinkType] = useState<LinkType | "none">("none");
  const [linkId, setLinkId] = useState<string>("");
  const [userTouchedLink, setUserTouchedLink] = useState(false);

  useEffect(() => {
    if (item) {
      setName(isNew ? "" : item.name);
      setPlanned(item.planned > 0 ? String(item.planned) : "");
      setActual(item.actual > 0 ? String(item.actual) : "");
      setIsCompleted(isNew ? false : item.is_completed);
      setNotes(isNew ? "" : (item.notes ?? ""));
      setLinkType(isNew ? "none" : ((item.link_type as LinkType) ?? "none"));
      setLinkId(isNew ? "" : (item.link_id ?? ""));
      setUserTouchedLink(false);
      setError("");
      setConfirmDelete(false);
      setIsSaving(false);

      const timer = setTimeout(() => nameRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Smart-suggest link type when creating a new item — only until the user
  // explicitly touches the picker.
  const suggestion = useMemo(
    () => suggestLink(category.type ?? null, name),
    [category.type, name]
  );
  useEffect(() => {
    if (!isNew || userTouchedLink) return;
    if (suggestion.link_type && linkType === "none") {
      setLinkType(suggestion.link_type);
    }
  }, [suggestion.link_type, isNew, userTouchedLink, linkType]);

  const targetOptions = useMemo(() => {
    if (linkType === "asset") return linkTargets?.assets ?? [];
    if (linkType === "debt") return linkTargets?.debts ?? [];
    return [];
  }, [linkType, linkTargets]);

  // Clear stale linkId when type changes
  useEffect(() => {
    if (linkType === "none") {
      setLinkId("");
      return;
    }
    if (linkId && !targetOptions.some((t) => t.id === linkId)) {
      setLinkId("");
    }
  }, [linkType, targetOptions, linkId]);

  const plannedNum = parseFloat(planned) || 0;
  const hasCategoryBudget = category.allocation > 0;
  const available = hasCategoryBudget
    ? category.allocation - category.otherItemsPlanned
    : null;
  const remaining = available !== null ? available - plannedNum : null;
  const isOverAllocation = remaining !== null && remaining < 0;
  const usedPct = hasCategoryBudget
    ? Math.min(
        100,
        Math.round(
          ((category.otherItemsPlanned + plannedNum) / category.allocation) * 100
        )
      )
    : 0;

  async function handleSave() {
    if (!item) return;
    if (!name.trim()) {
      setError("Item name is required.");
      haptic.error();
      return;
    }
    if (isOverAllocation) {
      setError(
        `Exceeds available ${fmt(available!)} by ${fmt(Math.abs(remaining!))}.`
      );
      haptic.error();
      return;
    }

    if (linkType !== "none" && !linkId) {
      setError("Pick a target for the link, or set Link to None.");
      haptic.error();
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const plannedVal = parseFloat(planned) || 0;
      const actualVal = parseFloat(actual) || 0;
      const notesVal = notes.trim() || null;
      const finalLinkType: LinkType | null = linkType === "none" ? null : linkType;
      const finalLinkId: string | null = finalLinkType ? linkId : null;

      if (isNew) {
        await onCreate({
          name: name.trim(),
          planned_amount: plannedVal,
          actual_amount: actualVal,
          is_completed: isCompleted,
          notes: notesVal,
          link_type: finalLinkType,
          link_id: finalLinkId,
        });
      } else {
        const updates: Parameters<typeof onSave>[1] = {};
        if (name.trim() !== item.name) updates.name = name.trim();
        if (plannedVal !== item.planned) updates.planned_amount = plannedVal;
        if (actualVal !== item.actual) updates.actual_amount = actualVal;
        if (isCompleted !== item.is_completed) updates.is_completed = isCompleted;
        if (notesVal !== item.notes) updates.notes = notesVal;
        const prevLinkType = (item.link_type as LinkType | null) ?? null;
        const prevLinkId = item.link_id ?? null;
        if (finalLinkType !== prevLinkType) updates.link_type = finalLinkType;
        if (finalLinkId !== prevLinkId) updates.link_id = finalLinkId;
        await onSave(item.id, updates);
      }

      haptic.success();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
      haptic.error();
    } finally {
      setIsSaving(false);
    }
  }

  function handleDelete() {
    if (!item || isNew) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      haptic.heavy();
      return;
    }
    onDelete(item.id);
    onClose();
  }

  return (
    <Drawer.Root
      open={!!item}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content
          aria-describedby="item-sheet-description"
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-card border-t border-border focus:outline-none max-h-[90dvh]"
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 bg-muted rounded-full" />
          </div>

          <div className="overflow-y-auto flex-1">
            {/* ── Category budget context ───────────────────────── */}
            <div className="px-5 pt-3 pb-5 border-b border-border">
              <div className="flex items-center gap-2 mb-4">
                {category.icon ? (
                  <span className="text-base leading-none">
                    {category.icon}
                  </span>
                ) : null}
                <Drawer.Title className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  {isNew ? `New item · ${category.name}` : category.name}
                </Drawer.Title>
              </div>

              {hasCategoryBudget ? (
                <>
                  {/* Allocation breakdown rows */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">
                        Category budget
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        <CurrencyText value={category.allocation} />
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">
                        Used by other items
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        − <CurrencyText value={category.otherItemsPlanned} />
                      </span>
                    </div>
                    <div className="border-t border-border/60 pt-2 flex justify-between items-center">
                      <span className="text-xs font-semibold text-foreground">
                        Available for this item
                      </span>
                      <span
                        className={`text-xs font-bold tabular-nums ${
                          isOverAllocation ? "text-neg" : "text-primary"
                        }`}
                      >
                        {isOverAllocation
                          ? (
                              <>
                                −<CurrencyText value={Math.abs(remaining!)} />
                              </>
                            )
                          : <CurrencyText value={remaining!} />}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${
                        isOverAllocation ? "bg-neg" : "bg-primary"
                      }`}
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[10px] tabular-nums text-muted-foreground">
                    <span>
                      <CurrencyText value={category.otherItemsPlanned + plannedNum} />{" "}
                      allocated
                    </span>
                    <span>{usedPct}% of budget</span>
                  </div>
                </>
              ) : (
                /* No category budget set */
                <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3">
                  <span className="material-symbols-outlined text-amber-500 text-base mt-0.5 shrink-0">
                    warning
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                      No category budget set
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Set the &ldquo;Budget&rdquo; for{" "}
                      <span className="font-medium">{category.name}</span> first.
                      Item amounts can only be allocated once a category budget
                      exists.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Form ─────────────────────────────────────────── */}
            <p id="item-sheet-description" className="sr-only">
              {isNew ? "Add a new budget item" : "Edit budget item details"}
            </p>
            <div className="px-5 pt-5 pb-6 space-y-5">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Item Name
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
                  placeholder="e.g. Electricity bill"
                />
              </div>

              {/* Planned + Actual */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    className={`text-[10px] font-bold uppercase tracking-widest ${
                      hasCategoryBudget
                        ? "text-muted-foreground"
                        : "text-muted-foreground/40"
                    }`}
                  >
                    Planned <CurrencySymbol className="currency-symbol" />
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={planned}
                      onChange={(e) => {
                        setPlanned(e.target.value);
                        setError("");
                      }}
                      disabled={!hasCategoryBudget}
                      className={`w-full rounded-xl border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors ${
                        !hasCategoryBudget
                          ? "opacity-40 cursor-not-allowed border-border"
                          : isOverAllocation
                          ? "border-neg focus:border-neg"
                          : "border-border focus:border-primary"
                      }`}
                      placeholder={hasCategoryBudget ? "0" : "—"}
                      min="0"
                    />
                  </div>
                  {!hasCategoryBudget ? (
                    <p className="text-[10px] text-muted-foreground/60">
                      Set category budget first
                    </p>
                  ) : isOverAllocation ? (
                    <p className="text-[10px] text-neg">
                      Over by <CurrencyText value={Math.abs(remaining!)} />
                    </p>
                  ) : remaining !== null && plannedNum > 0 ? (
                    <p className="text-[10px] text-muted-foreground">
                      <CurrencyText value={remaining} /> still available
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Spent <CurrencySymbol className="currency-symbol" />
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={actual}
                    onChange={(e) => setActual(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
                    placeholder="0"
                    min="0"
                  />
                </div>
              </div>

              {/* Completion toggle */}
              <button
                type="button"
                onClick={() => {
                  haptic.selection();
                  setIsCompleted((v) => !v);
                }}
                className={`flex items-center gap-3 w-full rounded-xl border px-4 py-3 transition-colors ${
                  isCompleted
                    ? "border-primary/30 bg-primary/10"
                    : "border-border bg-background"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-xl ${
                    isCompleted ? "text-primary" : "text-muted-foreground"
                  }`}
                  style={{
                    fontVariationSettings: isCompleted ? "'FILL' 1" : "'FILL' 0",
                  }}
                >
                  check_circle
                </span>
                <span
                  className={`text-sm font-medium ${
                    isCompleted ? "text-primary" : "text-foreground"
                  }`}
                >
                  {isCompleted ? "Marked as done" : "Mark as done"}
                </span>
              </button>

              {/* Link to (cross-section) */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Link to
                </label>
                <BottomSheetSelect<"none" | LinkType>
                  title="Link this item to"
                  placeholder="None"
                  value={linkType}
                  onChange={(v) => {
                    setUserTouchedLink(true);
                    setLinkType(v);
                  }}
                  options={[
                    { value: "none", label: "None" },
                    { value: "asset", label: "Asset / Goal", description: "Investment, savings, or goal" },
                    { value: "debt", label: "Debt", description: "Loan repayment" },
                  ]}
                />
                {linkType !== "none" && (
                  <BottomSheetSelect
                    title={`Pick ${linkType}`}
                    placeholder={
                      targetOptions.length === 0
                        ? `No ${linkType}s yet — create one first`
                        : `Select ${linkType}`
                    }
                    value={linkId}
                    onChange={setLinkId}
                    disabled={targetOptions.length === 0}
                    options={targetOptions.map((t) => ({
                      value: t.id,
                      label: t.name,
                      icon: t.icon ?? undefined,
                    }))}
                  />
                )}
                {!userTouchedLink &&
                  isNew &&
                  suggestion.link_type &&
                  linkType === suggestion.link_type && (
                    <p className="text-[10px] text-muted-foreground">
                      Suggested · {suggestion.reason}
                    </p>
                  )}
                {linkType !== "none" && linkId && (
                  <p className="text-[10px] text-muted-foreground">
                    Spend on this item also flows to the linked {linkType}.
                  </p>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary resize-none"
                  placeholder="Optional note…"
                />
              </div>

              {error ? <p className="text-xs text-neg">{error}</p> : null}

              {/* Actions */}
              <div className="flex flex-col gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50 active:scale-[0.98] transition-all"
                >
                  {isSaving ? "Saving…" : isNew ? "Add Item" : "Save"}
                </button>
                {isNew ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-3.5 rounded-xl text-sm font-medium bg-muted text-foreground active:scale-[0.98] transition-all"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className={`w-full py-3.5 rounded-xl text-sm font-medium active:scale-[0.98] transition-all ${
                      confirmDelete
                        ? "bg-destructive/10 text-destructive font-bold"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {confirmDelete ? "Tap again to confirm delete" : "Delete item"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
