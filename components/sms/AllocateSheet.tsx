"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { hasNumericText, formatCurrency } from "@/lib/number-format";
import { AppSourceBadge } from "@/components/sms/AppSourceBadge";
import type { SmsTransactionRow } from "@/lib/db";

export interface AllocatePickerItem {
  id: string;
  itemName: string;
  categoryName: string;
  /** Category icon (fallback glyph). */
  icon?: string | null;
  /** Item's own display emoji (preferred glyph). */
  emoji?: string | null;
  /** Planned + actual for the "<amount> left" hint (optional). */
  planned?: number;
  actual?: number;
}

export interface AllocateCategory {
  id: string;
  name: string;
  icon?: string | null;
}

interface AllocateSheetProps {
  /** Open when non-null. The transaction being allocated. */
  txn: SmsTransactionRow | null;
  /** Pre-formatted amount for the header (parent owns currency formatting). */
  amountLabel: string;
  /** Raw numeric amount, seeds the editable amount field. */
  amount: number | null;
  items: AllocatePickerItem[];
  categories: AllocateCategory[];
  onAllocate: (
    budgetItemId: string,
    remember: boolean,
    label?: string | null,
    amount?: number,
  ) => void;
  onCreateNew: (categoryId: string) => void;
  onClose: () => void;
  isPending: boolean;
  /**
   * "allocate" (default): first-time allocate of a pending txn — offers
   * remember-rule + create-new. "reallocate": move an already-categorized txn —
   * existing items only, no rule learning.
   */
  mode?: "allocate" | "reallocate";
}

type View = "items" | "pick-category";

export function AllocateSheet({
  txn,
  amountLabel,
  amount,
  items,
  categories,
  onAllocate,
  onCreateNew,
  onClose,
  isPending,
  mode = "allocate",
}: AllocateSheetProps) {
  const isReallocate = mode === "reallocate";
  const [view, setView] = useState<View>("items");
  const [chosenItem, setChosenItem] = useState("");
  const [remember, setRemember] = useState(true);
  const [label, setLabel] = useState("");
  // Editable spend amount (seeded from the parsed amount). Kept as a string so
  // the field can be cleared/typed; parsed back to a number on Allocate.
  const [amountText, setAmountText] = useState("");

  // Reset to a clean state every time a new transaction opens the sheet.
  // Idiomatic "adjust state during render on prop change" — no effect needed.
  const [prevId, setPrevId] = useState<string | null>(null);
  const txnId = txn?.id ?? null;
  if (txnId !== prevId) {
    setPrevId(txnId);
    if (txnId) {
      setView("items");
      setChosenItem(txn?.budget_item_id ?? "");
      setRemember(true);
      setLabel(txn?.label ?? "");
      setAmountText(amount != null ? String(amount) : "");
    }
  }

  const merchant = txn?.merchant_raw ?? "Unknown merchant";
  const labelTrimmed = label.trim();
  const currency = txn?.currency ?? "INR";
  const parsedAmount = parseFloat(amountText);
  const amountValid = hasNumericText(amountText) && parsedAmount > 0;
  const editedAmount =
    amountValid && parsedAmount !== amount ? parsedAmount : undefined;

  return (
    <Drawer.Root
      open={!!txn}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card sheet-3q focus:outline-none"
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="mx-auto w-9 h-1 bg-border rounded-full" />
          </div>

          {view === "items" ? (
            <>
              {/* Header — editable amount + merchant */}
              <div className="px-5 pt-2 pb-4 border-b border-border shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amountText}
                    onChange={(e) => setAmountText(e.target.value)}
                    aria-label="Amount"
                    placeholder={amountLabel}
                    className="figure min-w-0 flex-1 bg-transparent text-[26px] font-bold text-foreground focus:outline-none"
                  />
                  <span className="flex items-center gap-1.5 shrink-0">
                    <AppSourceBadge source={txn?.app_source} />
                    <span className="truncate text-[13px] font-bold text-foreground">
                      {merchant}
                    </span>
                  </span>
                </div>
                {!amountValid && (
                  <p className="mt-1 text-[11px] font-medium text-neg">
                    Enter an amount greater than 0.
                  </p>
                )}
                <Drawer.Title className="mt-3 t-label text-muted-foreground m-0">
                  {isReallocate ? "Move to" : "Allocate to"}
                </Drawer.Title>
              </div>

              {/* Scrollable list */}
              <div className="overflow-y-auto overscroll-contain flex-1">
                <ul className="px-2 py-2 space-y-0.5">
                  {/* Create-new — for spends not in the budget yet (allocate only) */}
                  {!isReallocate && (
                    <li>
                      <button
                        type="button"
                        onClick={() => setView("pick-category")}
                        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-tile text-left border border-dashed border-border text-foreground hover:bg-muted/50 active:bg-muted transition-colors"
                      >
                        <span className="material-symbols-outlined text-[20px] shrink-0">
                          add
                        </span>
                        <div>
                          <span className="text-sm font-medium block">
                            Create new item
                          </span>
                          <span className="text-[11px] text-muted-foreground block mt-0.5">
                            Not in your budget? Add it here.
                          </span>
                        </div>
                      </button>
                    </li>
                  )}

                  {items.length === 0 ? (
                    <li className="px-4 py-6 text-center text-xs text-muted-foreground">
                      No budget items this month yet. Create one above.
                    </li>
                  ) : (
                    items.map((it) => {
                      const isSelected = it.id === chosenItem;
                      const left =
                        it.planned != null && it.actual != null
                          ? Math.max(0, it.planned - it.actual)
                          : null;
                      return (
                        <li key={it.id}>
                          <button
                            type="button"
                            onClick={() => setChosenItem(it.id)}
                            className={`w-full flex items-center justify-between gap-2 px-4 py-3.5 rounded-tile text-left transition-colors ${
                              isSelected
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:bg-muted/50 active:bg-muted"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {(it.emoji || it.icon) && (
                                <span className="text-lg leading-none shrink-0">
                                  {it.emoji || it.icon}
                                </span>
                              )}
                              <div className="min-w-0">
                                <span className="text-sm font-medium block truncate">
                                  {it.itemName}
                                </span>
                                <span className="text-[11px] text-muted-foreground block mt-0.5 truncate">
                                  {it.categoryName}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {left != null && (
                                <span className="figure text-[11px] text-muted-foreground">
                                  {formatCurrency(left, {
                                    code: currency,
                                    maximumFractionDigits: 0,
                                  })}{" "}
                                  left
                                </span>
                              )}
                              {isSelected && (
                                <span className="material-symbols-outlined text-foreground text-[18px]">
                                  check
                                </span>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>

              {/* Footer — name + remember + actions */}
              <div className="shrink-0 border-t border-border px-5 pt-3 pb-safe">
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={80}
                  placeholder={`Name this transaction (e.g. ${merchant})`}
                  className="w-full h-[42px] rounded-tile border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent-strong"
                />
                {!isReallocate && (
                  <button
                    type="button"
                    onClick={() => setRemember((v) => !v)}
                    className="flex items-center gap-2 w-full py-2 text-left"
                  >
                    <span
                      className={`material-symbols-outlined text-[20px] ${
                        remember ? "text-accent-strong" : "text-muted-foreground"
                      }`}
                      style={{
                        fontVariationSettings: remember ? "'FILL' 1" : "'FILL' 0",
                      }}
                    >
                      {remember ? "check_box" : "check_box_outline_blank"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Remember this merchant for future transactions
                    </span>
                  </button>
                )}
                <div className="flex gap-2 pt-2 pb-3">
                  <button
                    type="button"
                    disabled={!chosenItem || !amountValid || isPending}
                    onClick={() =>
                      onAllocate(
                        chosenItem,
                        remember,
                        labelTrimmed || null,
                        editedAmount,
                      )
                    }
                    className="flex-1 h-[48px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition-all"
                  >
                    {isPending ? (isReallocate ? "Saving…" : "Allocating…") : isReallocate ? "Save" : "Allocate"}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-[48px] rounded-pill bg-muted px-5 text-sm font-semibold text-foreground active:scale-[0.98] transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Pick-category header */}
              <div className="px-3 pt-2 pb-3 border-b border-border shrink-0 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setView("items")}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/50 active:bg-muted transition-colors shrink-0"
                  aria-label="Back"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    arrow_back
                  </span>
                </button>
                <Drawer.Title className="t-label text-muted-foreground m-0">
                  Add to which category?
                </Drawer.Title>
              </div>

              {/* Category list */}
              <div className="overflow-y-auto overscroll-contain flex-1 pb-safe">
                {categories.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No categories yet. Create a budget first, then come back to
                    add this transaction.
                  </p>
                ) : (
                  <ul className="px-2 py-2 space-y-0.5">
                    {categories.map((cat) => (
                      <li key={cat.id}>
                        <button
                          type="button"
                          onClick={() => onCreateNew(cat.id)}
                          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-tile text-left text-muted-foreground hover:bg-muted/50 active:bg-muted transition-colors"
                        >
                          {cat.icon && (
                            <span className="text-lg leading-none shrink-0">
                              {cat.icon}
                            </span>
                          )}
                          <span className="text-sm font-medium text-foreground">
                            {cat.name}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="h-6" />
              </div>
            </>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
