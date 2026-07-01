"use client";

import { Drawer } from "vaul";
import { useEffect, useRef, useState } from "react";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useFormatCurrency } from "@/lib/hooks/useFormatCurrency";

type EntryType = "add_funds" | "withdraw" | "update_value";

interface AssetEntrySheetProps {
  open: boolean;
  entryType: EntryType;
  currentValue: number;
  onClose: () => void;
  onSave: (params: { entryType: EntryType; amount: number; note: string | null; entryDate: string }) => Promise<void>;
}

const ENTRY_CONFIG: Record<
  EntryType,
  { title: string; label: string; placeholder: string; hint: (v: number, fmt: (n: number) => string) => string }
> = {
  add_funds: {
    title: "Add Funds",
    label: "Amount to Add",
    placeholder: "e.g. 5000",
    hint: (v, fmt) => `New total will be ${fmt(v)}`,
  },
  withdraw: {
    title: "Withdraw",
    label: "Amount to Withdraw",
    placeholder: "e.g. 2000",
    hint: (v, fmt) => `New total will be ${fmt(Math.max(0, v))}`,
  },
  update_value: {
    title: "Update Market Value",
    label: "Current Market Value",
    placeholder: "e.g. 150000",
    hint: () => "Sets the current value of this asset",
  },
};

export function AssetEntrySheet({ open, entryType, currentValue, onClose, onSave }: AssetEntrySheetProps) {
  const haptic = useHaptic();
  const fmt = useFormatCurrency();
  const inputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const config = ENTRY_CONFIG[entryType];
  const numAmount = parseFloat(amount) || 0;

  const previewValue =
    entryType === "add_funds"
      ? currentValue + numAmount
      : entryType === "withdraw"
      ? currentValue - numAmount
      : numAmount;

  useEffect(() => {
    if (open) {
      setAmount("");
      setNote("");
      setEntryDate(new Date().toISOString().split("T")[0]);
      setError("");
      setIsSaving(false);
      const timer = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [open]);

  async function handleSave() {
    if (numAmount <= 0) {
      setError("Please enter a valid amount.");
      haptic.error();
      return;
    }
    if (entryType === "withdraw" && numAmount > currentValue) {
      setError(`Cannot withdraw more than current value (${fmt(currentValue)}).`);
      haptic.error();
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await onSave({ entryType, amount: numAmount, note: note.trim() || null, entryDate });
      haptic.success();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      haptic.error();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Drawer.Content
          aria-describedby="asset-entry-description"
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card focus:outline-none sheet-3q"
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="mx-auto w-9 h-1 bg-border rounded-full" />
          </div>

          <div className="overflow-y-auto flex-1 px-6 pt-4 pb-8 space-y-5">
            <div>
              <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground">{config.title}</Drawer.Title>
              <p id="asset-entry-description" className="text-[13px] text-muted-foreground mt-1">
                Current value:{" "}
                <span className="figure tabular-nums">
                  <CurrencyText value={currentValue} />
                </span>
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                {config.label}
              </label>
              <input
                ref={inputRef}
                type="number"
                inputMode="decimal"
                min="0"
                placeholder={config.placeholder}
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(""); }}
                className="w-full bg-card border border-border rounded-[13px] px-3.5 py-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
              />
              {numAmount > 0 && (
                <p className="text-xs text-muted-foreground px-1 tabular-nums">
                  {config.hint(previewValue, fmt)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                Date
              </label>
              <input
                type="date"
                value={entryDate}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full bg-card border border-border rounded-[13px] px-3.5 py-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                Note (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Monthly SIP, Bonus invested…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-card border border-border rounded-[13px] px-3.5 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40"
              />
            </div>

            {error && (
              <p className="text-xs text-neg font-medium">{error}</p>
            )}
          </div>

          <div className="shrink-0 flex flex-col gap-3 px-6 pt-3 pb-6 border-t border-border/60 bg-card">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full h-[48px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={onClose}
              className="w-full h-[48px] rounded-pill bg-muted text-foreground text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
