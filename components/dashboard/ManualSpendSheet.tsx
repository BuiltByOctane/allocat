"use client";

import { useRef, useState } from "react";
import { Drawer } from "vaul";
import { useQueryClient } from "@tanstack/react-query";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { CurrencySymbol } from "@/components/ui/CurrencySymbol";
import { useCurrency } from "@/lib/providers/CurrencyProvider";
import { useQuickLogSpend } from "@/lib/hooks/useDashboard";
import { useAddBudgetItem } from "@/lib/hooks/useBudget";
import { useSplitTransaction } from "@/lib/hooks/useSplitTransaction";
import type { SplitPartDraft } from "@/lib/sms/split";
import { SplitParts } from "@/components/sms/SplitParts";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useCurrentPeriod } from "@/lib/hooks/useCurrentPeriod";
import {
  ALLOCATE_PICKER_KEY,
  useAllocatePicker,
  useLinkTargets,
} from "@/lib/hooks/useAllocatePicker";
import { hasNumericText } from "@/lib/number-format";
import { sanitizeAmountInput } from "@/lib/utils/amountInput";
import {
  AllocateItemList,
  CategoryPickList,
} from "@/components/sms/AllocateSheet";
import { ItemDetailSheet, NEW_ITEM_ID } from "@/components/budget/ItemDetailSheet";
import { OVER_SURFACE_STYLE } from "@/lib/budget/meter";

interface SpendResult {
  itemName: string;
  remaining: number;
  planned: number;
  actual: number;
}

/**
 * amount → item (existing, or category → full item editor for a new one) → done.
 * Mirrors the SMS allocate sheet minus the transaction bits (no merchant, no
 * remember-rule): a manual spend has nothing to learn from. "split" divides the
 * amount across several items from the item step.
 */
type Step = "amount" | "item" | "category" | "split" | "done";

interface ManualSpendSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Seeds the amount on open (e.g. from the Web Share Target). */
  initialAmount?: number | null;
  /** Seeds the transaction name on open. */
  initialLabel?: string | null;
}

const LABEL_MAX = 80;

function AllocationStatus({ result }: { result: SpendResult }) {
  const { remaining, planned, itemName } = result;
  const pct = planned > 0 ? (remaining / planned) * 100 : 0;
  const isOver = remaining < 0;
  const isCritical = !isOver && pct <= 10;
  const isWarning = !isOver && pct > 10 && pct <= 30;

  const barPct = planned > 0 ? Math.min(100, Math.max(0, (remaining / planned) * 100)) : 0;
  const statusLabel = isOver ? "Over budget" : isCritical ? "Almost empty" : isWarning ? "Running low" : "Logged";

  return (
    <div className="rounded-tile bg-tile p-4 space-y-2" style={isOver ? OVER_SURFACE_STYLE : undefined}>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold text-foreground">{statusLabel}</span>
        <span
          className="text-[12px] font-bold tabular-nums"
          style={{ color: isOver || isCritical ? "var(--neg)" : isWarning ? "var(--warn)" : "var(--foreground)" }}
        >
          {isOver ? (
            <>
              Over by <CurrencyText value={Math.abs(remaining)} />
            </>
          ) : (
            <>
              <CurrencyText value={remaining} /> left
            </>
          )}
        </span>
      </div>
      <p className="text-[11px] font-medium text-muted-foreground truncate">
        <span className="text-foreground font-semibold">{itemName}</span>
        {" "}- <CurrencyText value={result.actual} /> of <CurrencyText value={planned} />
      </p>
      <div className="h-1.5 rounded-full bg-[var(--progress-empty)] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${barPct}%`,
            background: isCritical ? "var(--neg)" : isWarning ? "var(--warn)" : "var(--accent-strong)",
          }}
        />
      </div>
    </div>
  );
}

export function ManualSpendSheet({
  open,
  onOpenChange,
  initialAmount = null,
  initialLabel = null,
}: ManualSpendSheetProps) {
  const qc = useQueryClient();
  const haptic = useHaptic();
  const { code: currency } = useCurrency();
  const { data: pickerData } = useAllocatePicker(open);
  const linkTargets = useLinkTargets();
  const spend = useQuickLogSpend();
  const addItem = useAddBudgetItem();
  const split = useSplitTransaction();
  const { period } = useCurrentPeriod();

  const [step, setStep] = useState<Step>("amount");
  const [amountText, setAmountText] = useState("");
  const [chosenItem, setChosenItem] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SpendResult | null>(null);
  // Category of the item being created; the item editor is open while set.
  const [createCategoryId, setCreateCategoryId] = useState<string | null>(null);
  // Split part the item editor is creating for (null ⇒ a single-item create).
  const [createPartIndex, setCreatePartIndex] = useState<number | null>(null);
  // Item created from the split view, applied once by SplitParts (stable identity).
  const [partItemOverride, setPartItemOverride] = useState<
    { index: number; itemId: string } | undefined
  >(undefined);
  // Number of items the logged spend was split across (done view).
  const [splitCount, setSplitCount] = useState<number | null>(null);
  // Retry-safety: an item created in this editor session is reused if the spend
  // then fails, so a retry never inserts a duplicate budget item.
  const createdItemRef = useRef<{ categoryId: string; itemId: string } | null>(null);
  // isPending only flips on the next render, so a fast double tap could log the
  // same spend twice. Guard synchronously.
  const loggingRef = useRef(false);

  // Fresh flow on every open — "adjust state during render on prop change".
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setStep("amount");
      setAmountText(
        initialAmount != null && initialAmount > 0
          ? sanitizeAmountInput(String(initialAmount))
          : "",
      );
      setChosenItem("");
      setLabel((initialLabel ?? "").trim().slice(0, LABEL_MAX));
      setError(null);
      setResult(null);
      setCreateCategoryId(null);
      setCreatePartIndex(null);
      setPartItemOverride(undefined);
      setSplitCount(null);
    }
  }

  const parsedAmount = parseFloat(amountText);
  const amountValid = hasNumericText(amountText) && parsedAmount > 0;
  const labelTrimmed = label.trim();
  const items = pickerData?.items ?? [];
  const categories = pickerData?.categories ?? [];

  function startOver() {
    setStep("amount");
    setAmountText("");
    setChosenItem("");
    setLabel("");
    setError(null);
    setResult(null);
    setSplitCount(null);
  }

  function goNext() {
    if (!amountValid) {
      setError("Enter an amount greater than 0.");
      haptic.light();
      return;
    }
    setError(null);
    setStep("item");
    haptic.selection();
  }

  async function logTo(itemId: string) {
    const res = await spend.mutateAsync({
      itemId,
      amount: parsedAmount,
      label: labelTrimmed || null,
    });
    qc.invalidateQueries({ queryKey: ALLOCATE_PICKER_KEY });
    haptic.success();
    setResult(res);
    setStep("done");
  }

  async function handleLog() {
    if (!chosenItem || !amountValid || loggingRef.current) return;
    loggingRef.current = true;
    setError(null);
    try {
      await logTo(chosenItem);
    } catch (err) {
      console.error("[ManualSpendSheet] log failed:", err);
      haptic.heavy();
      setError("Couldn't log this spend. Try again.");
    } finally {
      loggingRef.current = false;
    }
  }

  async function handleSplit(parts: SplitPartDraft[], splitLabel: string | null) {
    if (!amountValid || loggingRef.current) return;
    loggingRef.current = true;
    setError(null);
    try {
      await split.mutateAsync({
        sourceTxnId: null,
        total: parsedAmount,
        label: splitLabel,
        parts,
      });
      haptic.success();
      setResult(null);
      setSplitCount(parts.length);
      setStep("done");
    } catch (err) {
      console.error("[ManualSpendSheet] split failed:", err);
      haptic.heavy();
      setError("Couldn't log this split. Try again.");
    } finally {
      loggingRef.current = false;
    }
  }

  // Create the item, then log the spend to it (or, for a split part, hand it
  // back to the split view). Thrown errors surface in the item editor, which
  // stays open for a retry.
  async function handleCreateItem(data: {
    name: string;
    emoji?: string | null;
    planned_amount: number;
    link_type?: "asset" | "debt" | null;
    link_id?: string | null;
  }) {
    if (!createCategoryId) return;
    const link =
      data.link_type && data.link_id
        ? { link_type: data.link_type, link_id: data.link_id }
        : null;

    const memo = createdItemRef.current;
    let itemId: string;
    if (memo && memo.categoryId === createCategoryId) {
      itemId = memo.itemId;
    } else {
      const created = await addItem.mutateAsync({
        categoryId: createCategoryId,
        name: data.name,
        emoji: data.emoji ?? null,
        planned: data.planned_amount,
        link,
        month: period.month,
        year: period.year,
      });
      itemId = created.id;
      createdItemRef.current = { categoryId: createCategoryId, itemId };
    }

    if (createPartIndex !== null) {
      setPartItemOverride({ index: createPartIndex, itemId });
      qc.invalidateQueries({ queryKey: ALLOCATE_PICKER_KEY });
      createdItemRef.current = null;
      return;
    }

    await logTo(itemId);
    createdItemRef.current = null;
  }

  const createMeta = createCategoryId ? pickerData?.metaById[createCategoryId] : undefined;

  return (
    <>
      <Drawer.Root
        repositionInputs={false}
        // A split keeps its sheet open under the item editor: closing it would
        // unmount SplitParts and lose the parts typed so far.
        open={open && (!createCategoryId || step === "split")}
        onOpenChange={(next) => {
          if (!next) onOpenChange(false);
        }}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card sheet-3q focus:outline-none"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-9 h-1 bg-border rounded-full" />
            </div>

            {step === "amount" && (
              <>
                <div className="px-5 pt-2 shrink-0">
                  <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground m-0">
                    Log a spend
                  </Drawer.Title>
                  <p className="text-[11px] font-medium text-muted-foreground mt-1">
                    For cash or spends SMS didn&apos;t catch.
                  </p>
                </div>

                <form
                  className="flex-1 flex flex-col px-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    goNext();
                  }}
                >
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8">
                    <span className="t-label text-muted-foreground">How much?</span>
                    <div className="flex items-baseline justify-center gap-1 w-full">
                      <CurrencySymbol className="figure text-[28px] font-bold text-muted-foreground" />
                      <input
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        value={amountText}
                        onChange={(e) => {
                          setAmountText(sanitizeAmountInput(e.target.value));
                          setError(null);
                        }}
                        aria-label="Amount"
                        placeholder="0"
                        size={Math.max(1, amountText.length)}
                        className="figure min-w-[2ch] max-w-full bg-transparent text-[52px] leading-none font-bold text-foreground text-center focus:outline-none placeholder:text-muted-foreground/50"
                      />
                    </div>
                    {error && <p className="text-[11px] font-medium text-neg">{error}</p>}
                  </div>

                  <div className="flex gap-2 pt-2 pb-3 pb-safe">
                    <button
                      type="submit"
                      disabled={!amountValid}
                      className="flex-1 h-[48px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                    >
                      Next
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="h-[48px] rounded-pill bg-muted px-5 text-sm font-semibold text-foreground active:scale-[0.98] transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            )}

            {step === "item" && (
              <>
                {/* Header — the amount, tap to edit */}
                <div className="px-3 pt-2 pb-4 border-b border-border shrink-0">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setStep("amount")}
                      className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/50 active:bg-muted transition-colors shrink-0"
                      aria-label="Edit amount"
                    >
                      <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep("amount")}
                      className="figure text-[26px] font-bold text-foreground text-left truncate"
                    >
                      <CurrencyText value={parsedAmount} />
                    </button>
                  </div>
                  <Drawer.Title className="mt-3 px-2 t-label text-muted-foreground m-0">
                    Log to
                  </Drawer.Title>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setPartItemOverride(undefined);
                      setStep("split");
                      haptic.selection();
                    }}
                    className="mt-2 px-2 flex items-center gap-1 text-xs font-semibold text-accent-strong"
                  >
                    <span className="material-symbols-outlined text-[16px]">call_split</span>
                    Split this
                  </button>
                </div>

                <div className="overflow-y-auto overscroll-contain flex-1">
                  <AllocateItemList
                    items={items}
                    chosenId={chosenItem}
                    onChoose={(id) => {
                      setChosenItem(id);
                      haptic.selection();
                    }}
                    onCreateNew={() => setStep("category")}
                    currency={currency}
                  />
                </div>

                {/* Footer — name + actions */}
                <div className="shrink-0 border-t border-border px-5 pt-3 pb-safe">
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    maxLength={LABEL_MAX}
                    placeholder="Name this spend (optional)"
                    enterKeyHint="done"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleLog();
                    }}
                    className="w-full h-[42px] rounded-tile border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent-strong"
                  />
                  {error && <p className="mt-2 text-[11px] font-medium text-neg">{error}</p>}
                  <div className="flex gap-2 pt-3 pb-3">
                    <button
                      type="button"
                      disabled={!chosenItem || spend.isPending}
                      onClick={handleLog}
                      className="flex-1 h-[48px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition-all"
                    >
                      {spend.isPending ? "Logging…" : "Log spend"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="h-[48px] rounded-pill bg-muted px-5 text-sm font-semibold text-foreground active:scale-[0.98] transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </>
            )}

            {step === "category" && (
              <>
                <div className="px-3 pt-2 pb-3 border-b border-border shrink-0 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setStep("item")}
                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/50 active:bg-muted transition-colors shrink-0"
                    aria-label="Back"
                  >
                    <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                  </button>
                  <Drawer.Title className="t-label text-muted-foreground m-0">
                    Add to which category?
                  </Drawer.Title>
                </div>
                <div className="overflow-y-auto overscroll-contain flex-1 pb-safe">
                  <CategoryPickList
                    categories={categories}
                    onPick={setCreateCategoryId}
                    emptyText="No categories yet. Create a budget first, then come back to log this spend."
                  />
                  <div className="h-6" />
                </div>
              </>
            )}

            {step === "split" && (
              <>
                <Drawer.Title className="sr-only">Split this spend</Drawer.Title>
                {error && (
                  <p role="alert" className="px-5 pt-1 text-[11px] font-medium text-neg shrink-0">
                    {error}
                  </p>
                )}
                <SplitParts
                  total={parsedAmount}
                  currency={currency}
                  merchant={null}
                  items={items}
                  categories={categories}
                  initialItemId={chosenItem || undefined}
                  initialLabel={label}
                  isPending={split.isPending}
                  onBack={() => {
                    setError(null);
                    setStep("item");
                  }}
                  onCreateNew={(categoryId, partIndex) => {
                    createdItemRef.current = null;
                    setCreatePartIndex(partIndex);
                    setCreateCategoryId(categoryId);
                  }}
                  onSubmit={handleSplit}
                  partItemOverride={partItemOverride}
                />
              </>
            )}

            {step === "done" && (
              <>
                <div className="px-5 pt-2 shrink-0">
                  <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground m-0">
                    Spend logged
                  </Drawer.Title>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-5 px-5 py-6">
                  <span
                    className="material-symbols-outlined text-accent-strong"
                    style={{ fontSize: "48px", fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                  <div className="figure text-[36px] font-bold text-foreground">
                    <CurrencyText value={parsedAmount} />
                  </div>
                  {result && (
                    <div className="w-full">
                      <AllocationStatus result={result} />
                    </div>
                  )}
                  {splitCount !== null && (
                    <p className="text-[13px] font-semibold text-muted-foreground">
                      Split across {splitCount} items
                    </p>
                  )}
                </div>
                <div className="flex gap-2 px-5 pt-2 pb-3 pb-safe shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="flex-1 h-[48px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold active:scale-[0.98] transition-all"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={startOver}
                    className="h-[48px] rounded-pill bg-muted px-5 text-sm font-semibold text-foreground active:scale-[0.98] transition-all"
                  >
                    Log another
                  </button>
                </div>
              </>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Create-new item — full editor, scoped to the chosen category */}
      <ItemDetailSheet
        item={
          open && createCategoryId && createMeta
            ? {
                id: NEW_ITEM_ID,
                // A split part's item is not the whole spend — don't prefill its label.
                name: createPartIndex !== null ? "" : labelTrimmed,
                planned: 0,
                actual: 0,
                is_completed: false,
                notes: null,
              }
            : null
        }
        category={{
          name: createMeta?.name ?? "",
          icon: createMeta?.icon ?? null,
          type: createMeta?.type ?? null,
          allocation: createMeta?.allocation ?? 0,
          otherItemsPlanned: createMeta?.plannedTotal ?? 0,
        }}
        linkTargets={linkTargets}
        hideActual
        onClose={() => {
          // Finished → the main sheet reopens on "done"; abandoned → back to items.
          // Either way the editor session is over, so drop the create memo.
          createdItemRef.current = null;
          setCreateCategoryId(null);
          setCreatePartIndex(null);
          setStep((s) => (s === "done" || s === "split" ? s : "item"));
        }}
        onCreate={handleCreateItem}
        onSave={async () => {}}
        onDelete={() => {}}
      />
    </>
  );
}
