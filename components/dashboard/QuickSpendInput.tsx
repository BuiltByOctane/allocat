"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Drawer } from "vaul";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { CurrencySymbol } from "@/components/ui/CurrencySymbol";
import { useFormatCurrency } from "@/lib/hooks/useFormatCurrency";
import { useCategoryItems, useQuickLogSpend } from "@/lib/hooks/useDashboard";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { parseSpend } from "@/lib/ai/parseSpend";

interface Category {
  id: string;
  name: string;
  icon?: string | null;
}

interface QuickSpendInputProps {
  categories: Category[];
}

interface SpendResult {
  itemName: string;
  remaining: number;
  planned: number;
  actual: number;
}

/** The two views that slide inside the single target-picker drawer. */
type View = "category" | "item";

function AllocationStatus({ result }: { result: SpendResult }) {
  const { remaining, planned, itemName } = result;
  const pct = planned > 0 ? (remaining / planned) * 100 : 0;
  const isOver = remaining < 0;
  const isCritical = !isOver && pct <= 10;
  const isWarning = !isOver && pct > 10 && pct <= 30;

  const barPct = planned > 0 ? Math.min(100, Math.max(0, (remaining / planned) * 100)) : 0;
  const statusLabel = isOver ? "Over Budget" : isCritical ? "Almost Empty" : isWarning ? "Running Low" : "Logged";

  return (
    <div className="border-t border-border pt-4 mt-1 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold text-foreground">
          {statusLabel}
        </span>
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
        {" "}- <CurrencyText value={result.actual} /> of{" "}
        <CurrencyText value={planned} />
      </p>
      <div className="h-1.5 rounded-full bg-[var(--progress-empty)] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: isOver ? "100%" : `${barPct}%`,
            background: isOver ? "var(--neg)" : "var(--accent-strong)",
          }}
        />
      </div>
    </div>
  );
}

export default function QuickSpendInput({ categories }: QuickSpendInputProps) {
  const fmt = useFormatCurrency();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [validationError, setValidationError] = useState<string>("");
  const [lastResult, setLastResult] = useState<SpendResult | null>(null);
  const [sharedNote, setSharedNote] = useState<string>("");
  // Single sliding target-picker drawer: open state + which view is showing.
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [view, setView] = useState<View>("category");

  const haptic = useHaptic();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const { data: items = [], isFetching: itemsLoading } = useCategoryItems(selectedCategoryId || null);
  const spendMutation = useQuickLogSpend();

  useEffect(() => {
    const shared = searchParams.get("shared");
    const focusFlag = searchParams.get("focus") === "quick-spend";
    if (!shared && !focusFlag) return;

    queueMicrotask(() => {
      if (shared) {
        const parsed = parseSpend(shared);
        if (parsed.amount !== null) {
          setAmount(String(parsed.amount));
          haptic.selection();
        }
        setSharedNote(parsed.note || parsed.raw);
      }

      const url = new URL(window.location.href);
      url.searchParams.delete("shared");
      url.searchParams.delete("focus");
      router.replace(url.pathname + (url.search ? url.search : ""), { scroll: false });

      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [searchParams, router, haptic]);

  function openPicker() {
    // Always open on the category view; if a category is already chosen the
    // user can still drill straight into items via the auto-slide below.
    setView(selectedCategoryId ? "item" : "category");
    setPickerOpen(true);
  }

  // Tapping a category sets it AND slides to the item view automatically.
  function handleCategoryChange(catId: string) {
    setSelectedCategoryId(catId);
    setSelectedItemId("");
    setLastResult(null);
    setValidationError("");
    setView("item");
    haptic.selection();
  }

  // Tapping an item sets it and closes the sheet (no auto-submit — the user may
  // still be typing the amount above).
  function handleItemChange(itemId: string) {
    setSelectedItemId(itemId);
    setLastResult(null);
    setValidationError("");
    setPickerOpen(false);
    haptic.selection();
  }

  function validate(): boolean {
    if (!selectedCategoryId) { setValidationError("Select a category."); return false; }
    if (!selectedItemId) { setValidationError("Select an item."); return false; }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setValidationError("Enter a valid amount greater than 0.");
      return false;
    }
    setValidationError("");
    return true;
  }

  async function handleSubmit() {
    if (!validate()) { haptic.light(); return; }
    spendMutation.mutate(
      { itemId: selectedItemId, amount: parseFloat(amount) },
      {
        onSuccess: (result) => {
          if (!result) return;
          haptic.success();
          setLastResult({
            itemName: result.itemName,
            remaining: result.remaining,
            planned: result.planned,
            actual: result.actual,
          });
          setAmount("");
        },
        onError: () => {
          haptic.heavy();
          setValidationError("Failed to log spend. Try again.");
        },
      }
    );
  }

  const categoryOptions = categories.map((cat) => ({
    value: cat.id,
    label: cat.name,
    icon: cat.icon ?? undefined,
  }));

  const mappedItems = items.map((item) => {
    const planned = Number(item.planned_amount ?? (item as unknown as { planned?: number }).planned ?? 0);
    const actual = Number(item.actual_amount ?? (item as unknown as { actual?: number }).actual ?? 0);
    return { ...item, planned, actual, remaining: planned - actual };
  });

  const itemOptions = mappedItems.map((item) => ({
    value: item.id,
    label: item.name,
    description:
      item.planned > 0
        ? `${fmt(item.remaining)} of ${fmt(item.planned)} remaining`
        : "No allocation set",
  }));

  const selectedItem = mappedItems.find((i) => i.id === selectedItemId);
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  return (
    <section ref={sectionRef}>
      <p className="text-[13px] font-bold text-foreground mb-1">
        Log a cash spend
      </p>
      <p className="text-[10.5px] font-medium text-muted-foreground mb-4">
        For cash or spends SMS didn&apos;t catch.
      </p>

      {sharedNote && (
        <div className="mb-4 rounded-2xl bg-tile px-3 py-2.5 flex items-start gap-2">
          <span
            className="material-symbols-outlined text-muted-foreground"
            style={{ fontSize: "16px", marginTop: "1px" }}
          >
            ios_share
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              Shared
            </p>
            <p className="text-[12px] font-medium text-foreground truncate">
              {sharedNote}
            </p>
          </div>
          <button
            onClick={() => setSharedNote("")}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              close
            </span>
          </button>
        </div>
      )}

      <div className="space-y-3.5">
        {/* Amount — primary, always-visible control */}
        <div>
          <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5 block">
            Amount (<CurrencySymbol className="currency-symbol" />)
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            placeholder="0"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setValidationError(""); setLastResult(null); }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="w-full bg-card border border-border rounded-[13px] px-3.5 py-3 text-lg font-bold text-foreground tabular-nums focus:outline-none focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40 transition-colors"
          />
        </div>

        {/* Category · Item target selector — opens the single sliding sheet */}
        <div>
          <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5 block">
            Category · Item
          </label>
          <button
            type="button"
            onClick={openPicker}
            className="w-full flex items-center justify-between gap-2 bg-card border border-border rounded-[13px] px-3.5 py-3 text-left focus:outline-none focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40 transition-colors"
          >
            {selectedItem ? (
              <span className="flex items-center gap-2 min-w-0">
                {selectedCategory?.icon && (
                  <span className="text-base leading-none shrink-0">
                    {selectedCategory.icon}
                  </span>
                )}
                <span className="text-sm font-semibold text-foreground truncate">
                  {selectedCategory?.name}
                </span>
                <span className="material-symbols-outlined text-muted-foreground text-[16px] shrink-0">
                  chevron_right
                </span>
                <span className="text-sm font-semibold text-foreground truncate">
                  {selectedItem.name}
                </span>
              </span>
            ) : (
              <span className="text-sm font-medium text-muted-foreground truncate">
                Choose category &amp; item
              </span>
            )}
            <span className="material-symbols-outlined text-muted-foreground text-[18px] shrink-0 ml-2">
              expand_more
            </span>
          </button>
        </div>

        {/* Remaining hint */}
        {selectedItem && !lastResult && (
          <p className="text-[11px] font-medium tabular-nums text-muted-foreground">
            {selectedItem.remaining > 0
              ? (
                  <>
                    <CurrencyText value={selectedItem.remaining} /> remaining
                    {" "}of <CurrencyText value={selectedItem.planned} />
                  </>
                )
              : selectedItem.planned === 0
              ? "No allocation set"
              : (
                  <>
                    Over budget by{" "}
                    <CurrencyText value={Math.abs(selectedItem.remaining)} />
                  </>
                )}
          </p>
        )}

        {validationError && (
          <p className="text-[11px] font-medium text-neg">{validationError}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={spendMutation.isPending}
          className="w-full h-[46px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {spendMutation.isPending ? "Logging…" : "Log spend"}
        </button>

        {lastResult && <AllocationStatus result={lastResult} />}
      </div>

      {/* Single sliding target picker: category → item in one drawer */}
      <Drawer.Root open={pickerOpen} onOpenChange={setPickerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card sheet-3q focus:outline-none"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-9 h-1 bg-border rounded-full" />
            </div>

            <Drawer.Title className="sr-only">Choose category and item</Drawer.Title>

            {/* Sliding track: two panes side-by-side, translate between views */}
            <div className="relative flex-1 overflow-hidden">
              <div
                className="flex h-full w-[200%] transition-transform duration-300 ease-out"
                style={{ transform: view === "category" ? "translateX(0)" : "translateX(-50%)" }}
              >
                {/* View: category */}
                <div className="w-1/2 h-full flex flex-col">
                  <div className="px-5 py-3 shrink-0">
                    <p className="font-display text-[18px] font-bold tracking-[-0.02em] text-foreground m-0">
                      Select Category
                    </p>
                  </div>
                  <div className="overflow-y-auto overscroll-contain flex-1 pb-safe">
                    {categoryOptions.length === 0 ? (
                      <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                        No categories yet. Create a budget first.
                      </p>
                    ) : (
                      <ul className="px-2 py-2 space-y-0.5">
                        {categoryOptions.map((opt) => {
                          const isSelected = opt.value === selectedCategoryId;
                          return (
                            <li key={opt.value}>
                              <button
                                type="button"
                                onClick={() => handleCategoryChange(opt.value)}
                                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left transition-colors ${
                                  isSelected
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground hover:bg-muted/50 active:bg-muted"
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  {opt.icon && (
                                    <span className="text-lg leading-none shrink-0">
                                      {opt.icon}
                                    </span>
                                  )}
                                  <span className="text-sm font-medium block truncate">
                                    {opt.label}
                                  </span>
                                </div>
                                <span className="material-symbols-outlined text-muted-foreground text-[18px] shrink-0 ml-2">
                                  chevron_right
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="h-6" />
                  </div>
                </div>

                {/* View: item */}
                <div className="w-1/2 h-full flex flex-col">
                  <div className="px-3 py-3 shrink-0 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setView("category")}
                      className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/50 active:bg-muted transition-colors shrink-0"
                      aria-label="Back to categories"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        arrow_back
                      </span>
                    </button>
                    <p className="font-display text-[18px] font-bold tracking-[-0.02em] text-foreground m-0 truncate">
                      {selectedCategory ? selectedCategory.name : "Select Item"}
                    </p>
                  </div>
                  <div className="overflow-y-auto overscroll-contain flex-1 pb-safe">
                    {itemsLoading ? (
                      <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                        Loading…
                      </p>
                    ) : itemOptions.length === 0 ? (
                      <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                        No items in this category yet.
                      </p>
                    ) : (
                      <ul className="px-2 py-2 space-y-0.5">
                        {itemOptions.map((opt) => {
                          const isSelected = opt.value === selectedItemId;
                          return (
                            <li key={opt.value}>
                              <button
                                type="button"
                                onClick={() => handleItemChange(opt.value)}
                                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left transition-colors ${
                                  isSelected
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground hover:bg-muted/50 active:bg-muted"
                                }`}
                              >
                                <div className="min-w-0">
                                  <span className="text-sm font-medium block truncate">
                                    {opt.label}
                                  </span>
                                  {opt.description && (
                                    <span className="text-[11px] text-muted-foreground block mt-0.5 font-mono tabular-nums truncate">
                                      {opt.description}
                                    </span>
                                  )}
                                </div>
                                {isSelected && (
                                  <span className="material-symbols-outlined text-foreground text-[18px] shrink-0 ml-2">
                                    check
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="h-6" />
                  </div>
                </div>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </section>
  );
}
