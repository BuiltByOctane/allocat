"use client";

import { useState } from "react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/currency/catalog";
import { useCurrency } from "@/lib/providers/CurrencyProvider";
import { useUpdateCurrency } from "@/lib/hooks/useUpdateCurrency";

export default function CurrencySelector() {
  const { code } = useCurrency();
  const update = useUpdateCurrency();
  const [open, setOpen] = useState(false);

  const active = code || DEFAULT_CURRENCY;
  const activeDef = CURRENCIES.find((c) => c.code === active) ?? CURRENCIES[0];

  return (
    <div className="bg-card border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex justify-between items-center p-5 hover:bg-muted transition-colors"
      >
        <div className="flex items-center gap-4">
          <MaterialSymbol icon="payments" className="text-muted-foreground" />
          <div className="text-left">
            <span className="font-bold tracking-tight text-foreground block">
              Currency
            </span>
            <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground">
              Display preference · {activeDef.code} {activeDef.symbol}
            </span>
          </div>
        </div>
        <MaterialSymbol
          icon={open ? "expand_less" : "expand_more"}
          className="text-muted-foreground"
        />
      </button>

      {open && (
        <div className="border-t border-border max-h-72 overflow-y-auto">
          {CURRENCIES.map((c) => {
            const selected = c.code === active;
            return (
              <button
                key={c.code}
                type="button"
                disabled={update.isPending}
                onClick={() => update.mutate(c.code)}
                className={`w-full flex justify-between items-center px-5 py-3 border-b border-border last:border-0 transition-colors ${
                  selected ? "bg-muted" : "hover:bg-muted/50"
                } disabled:opacity-50`}
              >
                <div className="flex items-center gap-3 text-left">
                  <span className="font-mono text-sm w-12 text-foreground">
                    {c.code}
                  </span>
                  <span className="text-sm text-foreground">{c.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    {c.symbol}
                  </span>
                  {selected && (
                    <MaterialSymbol
                      icon="check"
                      size={18}
                      className="text-foreground"
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {update.isError && (
        <div className="px-5 py-2 text-[11px] text-neg border-t border-border">
          {(update.error as Error).message}
        </div>
      )}
    </div>
  );
}
