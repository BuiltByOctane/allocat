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
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Drawer.Content
          aria-describedby="asset-entry-description"
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-card border-t border-border focus:outline-none max-h-[80dvh]"
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 bg-muted rounded-full" />
          </div>

          <div className="overflow-y-auto flex-1 px-5 pt-4 pb-8 space-y-5">
            <div>
              <Drawer.Title className="text-base font-bold text-foreground">{config.title}</Drawer.Title>
              <p id="asset-entry-description" className="text-sm text-muted-foreground mt-0.5">
                Current value:{" "}
                <span className="font-mono tabular-nums">
                  <CurrencyText value={currentValue} />
                </span>
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
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
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground"
              />
              {numAmount > 0 && (
                <p className="text-xs text-muted-foreground px-1 font-mono tabular-nums">
                  {config.hint(previewValue, fmt)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Date
              </label>
              <input
                type="date"
                value={entryDate}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Note (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Monthly SIP, Bonus invested…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground"
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 font-medium">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 py-3.5 bg-foreground text-background rounded-xl font-bold text-sm active:scale-95 transition-transform disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3.5 bg-background text-foreground rounded-xl font-medium text-sm border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
