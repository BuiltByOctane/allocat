"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BottomSheetSelect } from "@/components/ui/BottomSheetSelect";
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

function AllocationStatus({ result }: { result: SpendResult }) {
  const { remaining, planned, itemName } = result;
  const pct = planned > 0 ? (remaining / planned) * 100 : 0;
  const isOver = remaining < 0;
  const isCritical = !isOver && pct <= 10;
  const isWarning = !isOver && pct > 10 && pct <= 30;

  const barPct = planned > 0 ? Math.min(100, Math.max(0, (remaining / planned) * 100)) : 0;
  const statusLabel = isOver ? "Over Budget" : isCritical ? "Almost Empty" : isWarning ? "Running Low" : "Logged";

  return (
    <div className="border-t border-border pt-4 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground">
          {statusLabel}
        </span>
        <span
          className="font-mono text-[11px] tabular-nums"
          style={{ color: isOver || isCritical ? "#ef4444" : isWarning ? "#f59e0b" : "var(--foreground)" }}
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
      <p className="font-mono text-[10px] text-muted-foreground truncate">
        <span className="text-foreground">{itemName}</span>
        {" "}— <CurrencyText value={result.actual} /> of{" "}
        <CurrencyText value={planned} />
      </p>
      <div className="flex gap-[2px]">
        {Array.from({ length: 20 }).map((_, j) => (
          <div
            key={j}
            className="flex-1"
            style={{
              height: 2,
              background:
                isOver
                  ? j < 20 ? "#ef4444" : "var(--progress-empty)"
                  : j / 20 < barPct / 100
                  ? "var(--foreground)"
                  : "var(--progress-empty)",
            }}
          />
        ))}
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

  function handleCategoryChange(catId: string) {
    setSelectedCategoryId(catId);
    setSelectedItemId("");
    setLastResult(null);
    setValidationError("");
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

  return (
    <section ref={sectionRef}>
      <div className="border border-border bg-card p-6">
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-5">
          Quick Logger
        </p>

        {sharedNote && (
          <div className="mb-4 border border-border bg-background/60 px-3 py-2 flex items-start gap-2">
            <span
              className="material-symbols-outlined text-muted-foreground"
              style={{ fontSize: "14px", marginTop: "1px" }}
            >
              ios_share
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground">
                Shared
              </p>
              <p className="font-mono text-[11px] text-foreground truncate">
                {sharedNote}
              </p>
            </div>
            <button
              onClick={() => setSharedNote("")}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                close
              </span>
            </button>
          </div>
        )}

        <div className="space-y-4">
          {/* Category + Item row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground mb-1.5 block">
                Category
              </label>
              <BottomSheetSelect
                title="Select Category"
                placeholder="Category…"
                options={categoryOptions}
                value={selectedCategoryId}
                onChange={handleCategoryChange}
              />
            </div>
            <div>
              <label className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground mb-1.5 block">
                Item
              </label>
              <BottomSheetSelect
                title="Select Item"
                placeholder={
                  itemsLoading ? "Loading…" :
                  !selectedCategoryId ? "Pick category" :
                  items.length === 0 ? "No items" : "Item…"
                }
                options={itemOptions}
                value={selectedItemId}
                onChange={(val) => { setSelectedItemId(val); setLastResult(null); setValidationError(""); }}
                disabled={!selectedCategoryId || itemsLoading || items.length === 0}
              />
            </div>
          </div>

          {/* Remaining hint */}
          {selectedItem && !lastResult && (
            <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
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

          {/* Amount */}
          <div>
            <label className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground mb-1.5 block">
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
              className="w-full bg-background border border-border px-3 py-2.5 font-mono text-sm text-foreground tabular-nums focus:outline-none focus:border-foreground transition-colors"
            />
          </div>

          {validationError && (
            <p className="font-mono text-[10px] text-red-400">{validationError}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={spendMutation.isPending}
            className="w-full py-3 border border-foreground font-mono text-[10px] tracking-[0.14em] uppercase text-foreground hover:bg-foreground hover:text-background active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {spendMutation.isPending ? "Logging…" : "Log Spend →"}
          </button>

          {lastResult && <AllocationStatus result={lastResult} />}
        </div>
      </div>
    </section>
  );
}
