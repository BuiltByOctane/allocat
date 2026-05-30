"use client";

import { useCallback } from "react";
import { useCurrency } from "@/lib/providers/CurrencyProvider";
import {
  formatCurrency,
  formatCurrencyParts,
  type CurrencyFormatOptions,
} from "@/lib/number-format";

/**
 * Returns a formatter bound to the current user's currency.
 *
 * Example:
 *   const fmt = useFormatCurrency();
 *   fmt(1234)                    // "₹1,234" / "$1,234" depending on profile
 *   fmt(1234, { maximumFractionDigits: 2 })
 */
export function useFormatCurrency() {
  const { code, def } = useCurrency();

  return useCallback(
    (value: number, options: Omit<CurrencyFormatOptions, "code" | "locale"> = {}) =>
      formatCurrency(value, { ...options, code, locale: def.locale }),
    [code, def.locale]
  );
}

export function useFormatCurrencyParts() {
  const { code, def } = useCurrency();
  return useCallback(
    (value: number, options: Omit<CurrencyFormatOptions, "code" | "locale"> = {}) =>
      formatCurrencyParts(value, { ...options, code, locale: def.locale }),
    [code, def.locale]
  );
}
