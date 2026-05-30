import { getCurrencyDef, DEFAULT_CURRENCY } from "@/lib/currency/catalog";

export interface CurrencyFormatOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** ISO 4217 code. Defaults to INR for backwards compatibility with legacy callers. */
  code?: string;
  /** BCP 47 locale. When omitted, derived from the currency code. */
  locale?: string;
}

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(options: CurrencyFormatOptions = {}) {
  const def = getCurrencyDef(options.code ?? DEFAULT_CURRENCY);
  const locale = options.locale ?? def.locale;
  const code = def.code;

  const minimumFractionDigits =
    options.minimumFractionDigits ?? def.defaultFractionDigits;
  const maximumFractionDigits =
    options.maximumFractionDigits ?? minimumFractionDigits;
  const cacheKey = `${locale}:${code}:${minimumFractionDigits}:${maximumFractionDigits}`;

  let formatter = currencyFormatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits,
      maximumFractionDigits,
    });
    currencyFormatterCache.set(cacheKey, formatter);
  }
  return formatter;
}

export function formatCurrency(
  value: number,
  options: CurrencyFormatOptions = {}
) {
  return getCurrencyFormatter(options).format(value);
}

export function formatCurrencyParts(
  value: number,
  options: CurrencyFormatOptions = {}
) {
  return getCurrencyFormatter(options).formatToParts(value);
}

export function hasNumericText(value: string) {
  return /\d/.test(value);
}
