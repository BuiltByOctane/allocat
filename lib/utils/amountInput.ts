/**
 * Normalise a typed amount: digits and one decimal point (a comma counts as
 * one), at most 2 decimals and 10 integer digits. Keeps a trailing "." so the
 * user can keep typing "12." → "12.5".
 */
export function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [int = "", ...rest] = cleaned.split(".");
  const intPart = int.slice(0, 10);
  if (rest.length === 0) return intPart;
  return `${intPart}.${rest.join("").slice(0, 2)}`;
}
