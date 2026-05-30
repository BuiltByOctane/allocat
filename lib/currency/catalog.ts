export interface CurrencyDef {
  code: string;
  locale: string;
  label: string;
  symbol: string;
  /** Default fraction digits. 0 for INR-style budgets / JPY / KRW etc. */
  defaultFractionDigits: number;
}

export const CURRENCIES: readonly CurrencyDef[] = [
  { code: "INR", locale: "en-IN", label: "Indian Rupee",        symbol: "₹",  defaultFractionDigits: 0 },
  { code: "USD", locale: "en-US", label: "US Dollar",           symbol: "$",  defaultFractionDigits: 0 },
  { code: "EUR", locale: "de-DE", label: "Euro",                symbol: "€",  defaultFractionDigits: 0 },
  { code: "GBP", locale: "en-GB", label: "Pound Sterling",      symbol: "£",  defaultFractionDigits: 0 },
  { code: "JPY", locale: "ja-JP", label: "Japanese Yen",        symbol: "¥",  defaultFractionDigits: 0 },
  { code: "CNY", locale: "zh-CN", label: "Chinese Yuan",        symbol: "¥",  defaultFractionDigits: 0 },
  { code: "AUD", locale: "en-AU", label: "Australian Dollar",   symbol: "A$", defaultFractionDigits: 0 },
  { code: "CAD", locale: "en-CA", label: "Canadian Dollar",     symbol: "C$", defaultFractionDigits: 0 },
  { code: "CHF", locale: "de-CH", label: "Swiss Franc",         symbol: "Fr", defaultFractionDigits: 0 },
  { code: "SGD", locale: "en-SG", label: "Singapore Dollar",    symbol: "S$", defaultFractionDigits: 0 },
  { code: "AED", locale: "ar-AE", label: "UAE Dirham",          symbol: "د.إ", defaultFractionDigits: 0 },
  { code: "SAR", locale: "ar-SA", label: "Saudi Riyal",         symbol: "﷼",  defaultFractionDigits: 0 },
  { code: "HKD", locale: "en-HK", label: "Hong Kong Dollar",    symbol: "HK$", defaultFractionDigits: 0 },
  { code: "NZD", locale: "en-NZ", label: "New Zealand Dollar",  symbol: "NZ$", defaultFractionDigits: 0 },
  { code: "ZAR", locale: "en-ZA", label: "South African Rand",  symbol: "R",  defaultFractionDigits: 0 },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const DEFAULT_CURRENCY: CurrencyCode = "INR";

const CURRENCY_MAP: Record<string, CurrencyDef> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c])
);

export function getCurrencyDef(code: string | null | undefined): CurrencyDef {
  if (!code) return CURRENCY_MAP[DEFAULT_CURRENCY];
  return CURRENCY_MAP[code] ?? CURRENCY_MAP[DEFAULT_CURRENCY];
}

export function isKnownCurrency(code: string): code is CurrencyCode {
  return code in CURRENCY_MAP;
}
