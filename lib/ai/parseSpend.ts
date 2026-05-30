/**
 * Lightweight regex parser for shared text → spend fields.
 * No AI calls. Used when share_target lands raw text on the dashboard.
 */

export interface ParsedSpend {
  amount: number | null;
  note: string;
  raw: string;
}

const CURRENCY_TOKENS =
  /(?:₹|\bRs\.?\b|\bINR\b|\$|\bUSD\b|\bCAD\b|\bAUD\b|\bSGD\b|\bHKD\b|\bNZD\b|\bEUR\b|€|£|\bGBP\b|¥|\bJPY\b|\bCNY\b|\bCHF\b|\bAED\b|\bSAR\b|\bZAR\b)/gi;

export function parseSpend(input: string): ParsedSpend {
  const raw = input.trim();
  if (!raw) return { amount: null, note: "", raw };

  const cleaned = raw.replace(CURRENCY_TOKENS, " ").replace(/\s+/g, " ").trim();
  const numberMatch = cleaned.match(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/);

  let amount: number | null = null;
  let note = cleaned;

  if (numberMatch) {
    const normalized = numberMatch[0].replace(/,/g, "");
    const parsed = parseFloat(normalized);
    if (!isNaN(parsed) && parsed > 0) {
      amount = parsed;
      const before = cleaned.slice(0, numberMatch.index ?? 0).trim();
      const after = cleaned.slice((numberMatch.index ?? 0) + numberMatch[0].length).trim();
      note = [before, after].filter(Boolean).join(" ").replace(/^(?:on|for|at)\s+/i, "").trim();
    }
  }

  return { amount, note: note.slice(0, 120), raw };
}
