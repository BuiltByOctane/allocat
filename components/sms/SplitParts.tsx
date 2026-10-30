"use client";

import { useReducer, useState } from "react";
import { formatCurrency } from "@/lib/number-format";
import { sanitizeAmountInput } from "@/lib/utils/amountInput";
import {
  initSplitParts,
  resolveSplitAmounts,
  splitPartsReducer,
  validateSplit,
  type SplitPartDraft,
} from "@/lib/sms/split";
import {
  AllocateItemList,
  CategoryPickList,
  type AllocateCategory,
  type AllocatePickerItem,
} from "@/components/sms/AllocateSheet";

interface SplitPartsProps {
  total: number;
  currency: string;
  merchant: string | null; // header text; null for manual
  items: AllocatePickerItem[];
  categories: AllocateCategory[];
  initialItemId?: string; // pre-fills part 1
  initialLabel?: string;
  isPending: boolean;
  onBack: () => void;
  /** Caller creates the item, then supplies it via `partItemOverride`. */
  onCreateNew?: (categoryId: string, partIndex: number) => void;
  onSubmit: (parts: SplitPartDraft[], label: string | null) => void;
  /** Set a part's item once a create-new flow has produced it. */
  partItemOverride?: { index: number; itemId: string };
}

type View = { kind: "parts" } | { kind: "pick-item"; index: number } | { kind: "pick-category"; index: number };

/**
 * Split view for the allocate sheet. Renders inside the parent's Drawer.Content
 * (no Drawer of its own). Stateful logic lives in `splitPartsReducer`.
 */
export function SplitParts({
  total,
  currency,
  merchant,
  items,
  categories,
  initialItemId,
  initialLabel,
  isPending,
  onBack,
  onCreateNew,
  onSubmit,
  partItemOverride,
}: SplitPartsProps) {
  const [state, dispatch] = useReducer(splitPartsReducer, initialItemId, initSplitParts);
  const [view, setView] = useState<View>({ kind: "parts" });
  const [label, setLabel] = useState(initialLabel ?? "");
  // Raw typed text per row so "12." and empty stay editable.
  const [texts, setTexts] = useState<Record<number, string>>({});

  // Apply a parent-supplied item once (adjust state during render, keyed by identity).
  const [appliedOverride, setAppliedOverride] = useState(partItemOverride);
  if (partItemOverride && partItemOverride !== appliedOverride) {
    setAppliedOverride(partItemOverride);
    dispatch({ type: "setItem", index: partItemOverride.index, itemId: partItemOverride.itemId });
    setView({ kind: "parts" });
  }

  const money = (n: number) => formatCurrency(n, { code: currency });
  const { ok, remainder } = validateSplit(total, state.parts);
  const amounts = resolveSplitAmounts(total, state.parts);
  const lastIdx = state.parts.length - 1;
  const itemById = new Map(items.map((i) => [i.id, i]));
  const labelTrimmed = label.trim();

  if (view.kind === "pick-item") {
    const idx = view.index;
    const usedElsewhere = new Set(
      state.parts.filter((_, i) => i !== idx).map((p) => p.budgetItemId).filter(Boolean),
    );
    return (
      <>
        <PickHeader title="Pick an item" onBack={() => setView({ kind: "parts" })} />
        <div className="overflow-y-auto overscroll-contain flex-1 pb-safe">
          <AllocateItemList
            items={items.filter((i) => !usedElsewhere.has(i.id))}
            chosenId={state.parts[idx]?.budgetItemId ?? ""}
            onChoose={(id) => {
              dispatch({ type: "setItem", index: idx, itemId: id });
              setView({ kind: "parts" });
            }}
            onCreateNew={onCreateNew ? () => setView({ kind: "pick-category", index: idx }) : undefined}
            currency={currency}
          />
        </div>
      </>
    );
  }

  if (view.kind === "pick-category") {
    const idx = view.index;
    return (
      <>
        <PickHeader
          title="Add to which category?"
          onBack={() => setView({ kind: "pick-item", index: idx })}
        />
        <div className="overflow-y-auto overscroll-contain flex-1 pb-safe">
          <CategoryPickList
            categories={categories}
            onPick={(categoryId) => onCreateNew?.(categoryId, idx)}
            emptyText="No categories yet. Create a budget first, then come back to split this transaction."
          />
          <div className="h-6" />
        </div>
      </>
    );
  }

  return (
    <>
      {/* Header: total + merchant + back */}
      <div className="px-3 pt-2 pb-4 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/50 active:bg-muted transition-colors shrink-0"
            aria-label="Back"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <span className="figure min-w-0 flex-1 text-[26px] font-bold text-foreground">
            {money(total)}
          </span>
          {merchant && (
            <span className="shrink-0 truncate pr-2 text-[13px] font-bold text-foreground">
              {merchant}
            </span>
          )}
        </div>
        <p className="mt-3 px-2 t-label text-muted-foreground m-0">Parts</p>
      </div>

      {/* Rows */}
      <div className="overflow-y-auto overscroll-contain flex-1 px-4 py-3 space-y-2">
        {state.parts.map((p, i) => {
          const it = p.budgetItemId ? itemById.get(p.budgetItemId) : undefined;
          const isLast = i === lastIdx;
          const glyph = it?.emoji || it?.icon;
          return (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView({ kind: "pick-item", index: i })}
                className="flex min-w-0 flex-1 items-center gap-2 h-[44px] rounded-tile border border-border bg-background px-3 text-left active:bg-muted transition-colors"
              >
                {glyph && <span className="text-lg leading-none shrink-0">{glyph}</span>}
                <span
                  className={`min-w-0 flex-1 truncate text-sm font-medium ${
                    it ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {it ? it.itemName : "Choose item"}
                </span>
                <span className="material-symbols-outlined text-[18px] text-muted-foreground shrink-0">
                  expand_more
                </span>
              </button>
              {isLast ? (
                <div className="w-[112px] shrink-0 h-[44px] rounded-tile bg-muted px-3 flex flex-col items-end justify-center">
                  <span
                    className={`figure text-sm font-semibold ${
                      remainder <= 0 ? "text-neg" : "text-foreground"
                    }`}
                  >
                    {money(amounts[i] ?? 0)}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-none">auto</span>
                </div>
              ) : (
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`Part ${i + 1} amount`}
                  placeholder="0"
                  value={texts[i] ?? (p.amount != null ? String(p.amount) : "")}
                  onChange={(e) => {
                    const clean = sanitizeAmountInput(e.target.value);
                    setTexts((t) => ({ ...t, [i]: clean }));
                    const n = parseFloat(clean);
                    dispatch({
                      type: "setAmount",
                      index: i,
                      amount: Number.isFinite(n) ? n : null,
                    });
                  }}
                  className="figure w-[112px] shrink-0 h-[44px] rounded-tile border border-border bg-background px-3 text-right text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent-strong"
                />
              )}
              {state.parts.length > 2 && (
                <button
                  type="button"
                  aria-label={`Remove part ${i + 1}`}
                  onClick={() => {
                    dispatch({ type: "remove", index: i });
                    setTexts({});
                  }}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/50 active:bg-muted transition-colors shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "add", total });
            setTexts({});
          }}
          className="w-full flex items-center justify-center gap-1 h-[44px] rounded-tile border border-dashed border-border text-sm font-medium text-foreground hover:bg-muted/50 active:bg-muted transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add another part
        </button>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-border px-5 pt-3 pb-safe">
        <div className="flex items-center justify-between pb-2">
          <span className="text-xs text-muted-foreground">Remaining</span>
          <span
            className={`figure flex items-center gap-1 text-sm font-semibold ${
              remainder <= 0 ? "text-neg" : "text-foreground"
            }`}
          >
            {money(remainder)}
            {ok && (
              <span className="material-symbols-outlined text-[16px] text-accent-strong">
                check
              </span>
            )}
          </span>
        </div>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          placeholder={`Name this transaction (e.g. ${merchant ?? "Groceries"})`}
          className="w-full h-[42px] rounded-tile border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent-strong"
        />
        <div className="flex gap-2 pt-3 pb-3">
          <button
            type="button"
            disabled={!ok || isPending}
            onClick={() => onSubmit(state.parts, labelTrimmed || null)}
            className="flex-1 h-[48px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            {isPending ? "Allocating…" : "Allocate split"}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="h-[48px] rounded-pill bg-muted px-5 text-sm font-semibold text-foreground active:scale-[0.98] transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

function PickHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="px-3 pt-2 pb-3 border-b border-border shrink-0 flex items-center gap-1">
      <button
        type="button"
        onClick={onBack}
        className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/50 active:bg-muted transition-colors shrink-0"
        aria-label="Back"
      >
        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
      </button>
      <span className="t-label text-muted-foreground">{title}</span>
    </div>
  );
}
