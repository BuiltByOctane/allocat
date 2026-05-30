"use client";

import { useFormatCurrencyParts } from "@/lib/hooks/useFormatCurrency";
import { type CurrencyFormatOptions } from "@/lib/number-format";

interface CurrencyTextProps extends Omit<CurrencyFormatOptions, "code" | "locale"> {
  value: number;
  className?: string;
  symbolClassName?: string;
}

export function CurrencyText({
  value,
  className = "",
  symbolClassName = "",
  minimumFractionDigits,
  maximumFractionDigits,
}: CurrencyTextProps) {
  const toParts = useFormatCurrencyParts();
  const parts = toParts(value, {
    minimumFractionDigits,
    maximumFractionDigits,
  });

  return (
    <span className={`inline-flex items-baseline font-mono tabular-nums ${className}`.trim()}>
      {parts.map((part, index) => (
        <span
          key={`${part.type}-${index}`}
          className={
            part.type === "currency"
              ? `currency-symbol ${symbolClassName}`.trim()
              : undefined
          }
        >
          {part.value}
        </span>
      ))}
    </span>
  );
}
