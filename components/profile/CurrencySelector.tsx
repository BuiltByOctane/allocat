"use client";

import { useState } from "react";
import { Wallet, ChevronDown, ChevronUp, Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
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
    <Card compact className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-3.5 text-left"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tile text-muted-foreground">
          <Wallet size={18} strokeWidth={1.7} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-bold text-foreground">Currency</div>
          <div className="text-[10.5px] font-medium text-muted-foreground mt-0.5">
            Display preference · {activeDef.code} {activeDef.symbol}
          </div>
        </div>
        {open ? (
          <ChevronUp size={18} strokeWidth={1.7} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={18} strokeWidth={1.7} className="text-muted-foreground" />
        )}
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
                className={`w-full flex justify-between items-center px-3.5 py-3 border-b border-border last:border-0 transition-colors ${
                  selected ? "bg-muted" : "hover:bg-muted/50"
                } disabled:opacity-50`}
              >
                <div className="flex items-center gap-3 text-left">
                  <span className="figure text-sm w-12 text-foreground">{c.code}</span>
                  <span className="text-sm font-medium text-foreground">{c.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="figure text-xs text-muted-foreground">{c.symbol}</span>
                  {selected && <Check size={18} strokeWidth={2} className="text-foreground" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {update.isError && (
        <div className="px-3.5 py-2 text-[11px] text-neg border-t border-border">
          {(update.error as Error).message}
        </div>
      )}
    </Card>
  );
}
