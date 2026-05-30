"use client";

import { useCurrency } from "@/lib/providers/CurrencyProvider";

interface CurrencySymbolProps {
  className?: string;
  /** When true, falls back to the ISO code if no short symbol is available. */
  preferCode?: boolean;
}

export function CurrencySymbol({ className, preferCode = false }: CurrencySymbolProps) {
  const { def } = useCurrency();
  const text = preferCode ? def.code : def.symbol;
  return <span className={className}>{text}</span>;
}
