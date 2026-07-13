"use client";

import { Drawer } from "vaul";
import { useEffect, useMemo, useRef, useState } from "react";
import { computeAutoCompletion } from "@/lib/utils/budget-completion";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { CurrencySymbol } from "@/components/ui/CurrencySymbol";
import { useFormatCurrency } from "@/lib/hooks/useFormatCurrency";
import { BottomSheetSelect } from "@/components/ui/BottomSheetSelect";
import EmojiPickerModal from "@/components/ui/EmojiPickerModal";
import { ItemTransactionList } from "@/components/budget/ItemTransactionList";
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
  emoji?: string | null;
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
  /** Quick-add name suggestions for this category (new items only) — tap to
   *  fill the name field instead of typing. */
  suggestions?: string[];
  /** Hide the "Spent" field and force actual_amount to 0 on create.
   *  Used by the SMS allocate flow, where the spend is applied separately
   *  via categorize (which also cascades to a linked asset/debt). */
  hideActual?: boolean;
  onClose: () => void;
  onSave: (
    itemId: string,
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
  ) => Promise<void>;
  onCreate: (data: {
    name: string;
    emoji?: string | null;
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
  suggestions = [],
  hideActual = false,
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
  const [emoji, setEmoji] = useState<string | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);
  const [planned, setPlanned] = useState("");
  const [actual, setActual] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linkType, setLinkType] = useState<LinkType | "none">("none");
  const [linkId, setLinkId] = useState<string>("");
  const [userTouchedLink, setUserTouchedLink] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Planning and tracking are different modes: creation is plan-only (name +
  // amount). Spent is only ever edited on an existing item.
  const hideSpentField = isNew || hideActual;

  useEffect(() => {
    if (item) {
      setName(item.name ?? "");
      setEmoji(isNew ? null : (item.emoji ?? null));
      setEmojiPickerOpen(false);
      setPlanned(item.planned > 0 ? String(item.planned) : "");
      setActual(item.actual > 0 ? String(item.actual) : "");
      setNotes(isNew ? "" : (item.notes ?? ""));
      setLinkType(isNew ? "none" : ((item.link_type as LinkType) ?? "none"));
      setLinkId(isNew ? "" : (item.link_id ?? ""));
      setUserTouchedLink(false);
      setShowMore(!isNew && (!!item.notes || !!item.link_type));
      setError("");
      setConfirmDelete(false);
      setIsSaving(false);

      const timer = setTimeout(() => nameRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Smart-suggest link type when creating a new item — only after the user
  // opens "More options" (it's collapsed by default, so a silent link would
  // otherwise get set with no visible target and no way to notice it), and
  // only until the user explicitly touches the picker.
  const suggestion = useMemo(
    () => suggestLink(category.type ?? null, name),
    [category.type, name]
  );
  useEffect(() => {
    if (!isNew || userTouchedLink || !showMore) return;
    if (suggestion.link_type && linkType === "none") {
      setLinkType(suggestion.link_type);
    }
  }, [suggestion.link_type, isNew, userTouchedLink, linkType, showMore]);

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
        // Spent isn't collected at creation — planning and tracking are
        // separate modes; actual spend is logged later via transactions/SMS.
        const createdActual = 0;
        await onCreate({
          name: name.trim(),
          emoji,
          planned_amount: plannedVal,
          actual_amount: createdActual,
          // Done is derived from spend, not a manual toggle.
          is_completed: computeAutoCompletion(plannedVal, createdActual),
          notes: notesVal,
          link_type: finalLinkType,
          link_id: finalLinkId,
        });
      } else {
        const updates: Parameters<typeof onSave>[1] = {};
        if (name.trim() !== item.name) updates.name = name.trim();
        if (emoji !== (item.emoji ?? null)) updates.emoji = emoji;
        if (plannedVal !== item.planned) updates.planned_amount = plannedVal;
        if (actualVal !== item.actual) updates.actual_amount = actualVal;
        // is_completed is no longer sent explicitly — the update path derives it
        // from actual_amount vs planned.
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
    <>
    <Drawer.Root
      open={!!item}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content
          ref={setContentNode}
          aria-describedby="item-sheet-description"
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card focus:outline-none sheet-3q"
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="mx-auto w-9 h-1 bg-border rounded-full" />
          </div>

          <div className="overflow-y-auto flex-1">
            {/* ── Header ──────────────────────────────────────── */}
            <div className="px-6 pt-2 pb-3">
              <div className="flex items-center gap-2">
                {category.icon ? (
                  <span className="text-base leading-none">
                    {category.icon}
                  </span>
                ) : null}
                <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground truncate">
                  {isNew ? `New item · ${category.name}` : category.name}
                </Drawer.Title>
              </div>
            </div>

            {/* ── Category budget context — one line, not a ledger ──── */}
            <div className="px-6 pb-3">
              {hasCategoryBudget ? (
                <p
                  className={`text-xs font-medium ${
                    isOverAllocation ? "text-neg" : "text-muted-foreground"
                  }`}
                >
                  {isOverAllocation ? (
                    <>
                      −<CurrencyText value={Math.abs(remaining!)} /> over the{" "}
                      <span className="font-bold">{category.name}</span> budget
                    </>
                  ) : (
                    <>
                      <CurrencyText value={remaining!} /> available in{" "}
                      <span className="font-bold text-foreground">{category.name}</span>
                    </>
                  )}
                </p>
              ) : (
                /* No category budget set */
                <div className="flex items-start gap-3 rounded-tile bg-[var(--warn)]/10 border border-[var(--warn)]/20 px-4 py-3">
                  <span className="material-symbols-outlined text-[var(--warn)] text-base mt-0.5 shrink-0">
                    warning
                  </span>
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      No category budget set
                    </p>
                    <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
                      Set the &ldquo;Budget&rdquo; for{" "}
                      <span className="font-bold">{category.name}</span> first.
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
            <div className="px-6 pt-2 pb-6 space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground block">
                  Item Name
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      haptic.light();
                      setEmojiPickerOpen(true);
                    }}
                    className="flex size-[46px] shrink-0 items-center justify-center rounded-[13px] border border-border bg-card text-xl transition-colors hover:border-[var(--accent-strong)]"
                    title="Choose emoji"
                    aria-label="Choose emoji"
                  >
                    {emoji || (
                      <span className="material-symbols-outlined text-[20px] text-muted-foreground">
                        add_reaction
                      </span>
                    )}
                  </button>
                  <input
                    ref={nameRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave();
                    }}
                    className="w-full rounded-[13px] border border-border bg-card px-3.5 py-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
                    placeholder="e.g. Electricity bill"
                  />
                </div>
                {emoji ? (
                  <button
                    type="button"
                    onClick={() => {
                      haptic.light();
                      setEmoji(null);
                    }}
                    className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    Remove emoji
                  </button>
                ) : null}
                {isNew && suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          haptic.selection();
                          setName(s);
                        }}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
                          name === s
                            ? "bg-[var(--pill)] text-[var(--pill-foreground)] border-transparent"
                            : "bg-tile text-foreground border-border"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Planned + Actual */}
              <div className={hideSpentField ? "" : "grid grid-cols-2 gap-3"}>
                <div className="space-y-2">
                  <label
                    className={`text-[9px] font-bold uppercase tracking-wide block ${
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
                      className={`w-full rounded-[13px] border bg-card px-3.5 py-3 text-sm font-medium tabular-nums text-foreground outline-none transition-colors ${
                        !hasCategoryBudget
                          ? "opacity-40 cursor-not-allowed border-border"
                          : isOverAllocation
                          ? "border-neg focus:border-neg"
                          : "border-border focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
                      }`}
                      placeholder={hasCategoryBudget ? "0" : "-"}
                      min="0"
                    />
                  </div>
                  {!hasCategoryBudget ? (
                    <p className="text-[10px] font-medium text-muted-foreground/60">
                      Set category budget first
                    </p>
                  ) : isOverAllocation ? (
                    <p className="text-[10px] font-medium text-neg">
                      Over by <CurrencyText value={Math.abs(remaining!)} />
                    </p>
                  ) : remaining !== null && plannedNum > 0 ? (
                    <p className="text-[10px] font-medium text-muted-foreground">
                      <CurrencyText value={remaining} /> still available
                    </p>
                  ) : null}
                </div>
                {!hideSpentField && (
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground block">
                      Spent <CurrencySymbol className="currency-symbol" />
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={actual}
                      onChange={(e) => setActual(e.target.value)}
                      className="w-full rounded-[13px] border border-border bg-card px-3.5 py-3 text-sm font-medium tabular-nums text-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
                      placeholder="0"
                      min="0"
                    />
                  </div>
                )}
              </div>

              {/* More options — Link to + Notes, collapsed by default */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    haptic.light();
                    setShowMore((v) => !v);
                  }}
                  className="flex w-full items-center justify-center gap-1 py-1 text-xs font-semibold text-muted-foreground"
                >
                  More options
                  <span
                    className={`material-symbols-outlined text-base transition-transform ${
                      showMore ? "rotate-180" : ""
                    }`}
                  >
                    expand_more
                  </span>
                </button>

                {showMore && (
                  <div className="space-y-4 pt-3">
                    {/* Link to (cross-section) */}
                    <div className="space-y-2">
                      <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground block">
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
                        className="flex w-full items-center justify-between rounded-[13px] border border-border bg-card px-3.5 py-3 text-sm font-medium text-foreground"
                      />
                      {linkType !== "none" && (
                        <BottomSheetSelect
                          title={`Pick ${linkType}`}
                          placeholder={
                            targetOptions.length === 0
                              ? `No ${linkType}s yet - create one first`
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
                          className="flex w-full items-center justify-between rounded-[13px] border border-border bg-card px-3.5 py-3 text-sm font-medium text-foreground"
                        />
                      )}
                      {!userTouchedLink &&
                        isNew &&
                        suggestion.link_type &&
                        linkType === suggestion.link_type && (
                          <p className="text-[10px] font-medium text-muted-foreground">
                            Suggested · {suggestion.reason}
                          </p>
                        )}
                      {linkType !== "none" && linkId && (
                        <p className="text-[10px] font-medium text-muted-foreground">
                          Spend on this item also flows to the linked {linkType}.
                        </p>
                      )}
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                      <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground block">
                        Notes
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        className="w-full rounded-[13px] border border-border bg-card px-3.5 py-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40 resize-none"
                        placeholder="Optional note…"
                      />
                    </div>
                  </div>
                )}
              </div>

              {error ? <p className="text-xs font-medium text-neg">{error}</p> : null}

              {/* Transactions — per-item activity history */}
              {!isNew && item ? (
                <ItemTransactionList
                  itemId={item.id}
                  itemEmoji={emoji ?? item.emoji ?? null}
                  categoryIcon={category.icon}
                />
              ) : null}

            </div>
          </div>

          {/* Pinned action footer — OUTSIDE the scroll body (shrink-0) so it
              stays above the keyboard, matching DebtDetailSheet. */}
          <div className="shrink-0 flex gap-3 px-6 pt-3 pb-6 border-t border-border/60 bg-card">
            {isNew ? (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-[48px] rounded-pill bg-muted text-foreground text-sm font-semibold active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDelete}
                className={`flex-1 h-[48px] rounded-pill text-sm font-bold active:scale-[0.98] transition-all ${
                  confirmDelete
                    ? "bg-[var(--neg-dim)] text-neg"
                    : "border border-border bg-card text-neg"
                }`}
              >
                {confirmDelete ? "Confirm delete" : "Delete"}
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex-[2] h-[48px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {isSaving
                ? "Saving…"
                : isNew
                ? hasCategoryBudget && remaining !== null && plannedNum > 0 && !isOverAllocation
                  ? `Add · ${fmt(remaining)} left after this`
                  : "Add Item"
                : "Save"}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>

    <EmojiPickerModal
      isOpen={emojiPickerOpen}
      onClose={() => setEmojiPickerOpen(false)}
      onSelect={(e) => setEmoji(e)}
      container={contentNode}
    />
    </>
  );
}
