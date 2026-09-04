/**
 * Pure prompt-building + response-parsing for the AI monthly report summary.
 * Kept out of the `"use server"` action so these can be unit-tested without
 * network/Supabase. Mirrors `insightPrompt.ts`.
 *
 * Output is PLAIN TEXT (the report Notes field is a plain <textarea>): a few
 * `- ` bullets followed by a short closing paragraph.
 */
import { formatCurrency } from "@/lib/number-format";

const SUMMARY_MAX = 1000;

export interface MonthlySummaryCategory {
  name: string;
  allocated: number;
  spent: number;
}

export interface MonthlySummaryMerchant {
  label: string;
  amount: number;
}

export interface MonthlySummaryStats {
  currency: string;
  /** e.g. "August 2026" — the completed month being summarised. */
  monthLabel: string;
  totalBudget: number;
  totalAllocated: number;
  totalSpent: number;
  /** Categorized (allocated) transactions counted this month. */
  txnCount: number;
  /** Still-pending (uncategorized) transactions this month. */
  pendingCount: number;
  /** Total amount of those still-pending transactions. */
  pendingAmount: number;
  categories: MonthlySummaryCategory[];
  topMerchants: MonthlySummaryMerchant[];
}

export const MONTHLY_SUMMARY_SYSTEM = [
  "You are AlloCat - a calm, observant financial companion. You write ONE end-of-month recap for the user's report Notes, from their real data below.",
  "",
  "STRUCTURE - follow exactly:",
  "1. Three to four short bullet lines, each starting with '- ':",
  "   - spend vs budget (amount and whether under/over, with the difference).",
  "   - the biggest category and how it did against its plan.",
  "   - whether every transaction was allocated (all categorized, or N still pending worth the stated amount).",
  "   - one concrete, doable nudge for next month.",
  "2. Then ONE blank line.",
  "3. Then a short closing paragraph (2-3 sentences) on how the month went financially, in plain language.",
  "4. Then ONE blank line, then a line starting with 'Tip: ' giving concrete budget tune-ups for next month:",
  "   - Name specific categories and the exact amount to raise or lower each plan by, based on how they did (e.g. a category that overspent by X, or one that came in well under and could give up some of its plan).",
  "   - Where you free up money, say to move that amount toward savings or a goal.",
  "   - Aim for a smoother, more realistic budget - 1 to 3 adjustments, no more. If the budget already fit spending well, say it looks well-tuned and suggest saving the surplus instead.",
  "",
  "RULES:",
  "- Never invent numbers. Only use figures from the data. Adjustment amounts must follow from the category figures shown.",
  "- Be specific: include the relevant amount or percentage.",
  "- Calm, lightly witty, never preachy or guilt-inducing. No lectures.",
  "- Format every amount with the currency code shown in the data.",
  "- Plain text only. No markdown headings, no bold, no emojis. Bullets use '- '.",
  "- Do not add a title, preamble, or sign-off. Start directly with the first bullet.",
].join("\n");

export function buildMonthlySummaryPrompt(s: MonthlySummaryStats): string {
  const money = (v: number) =>
    formatCurrency(v, { code: s.currency, maximumFractionDigits: 0 });

  const lines: string[] = [
    `Currency: ${s.currency}`,
    `Month: ${s.monthLabel}`,
    "",
    "TOTALS:",
    `  Budget ${money(s.totalBudget)}; allocated ${money(s.totalAllocated)}; spent ${money(s.totalSpent)}.`,
    `  ${money(s.totalBudget - s.totalSpent)} ${s.totalSpent <= s.totalBudget ? "under" : "over"} budget.`,
    "",
    "TRANSACTIONS:",
    s.pendingCount > 0
      ? `  ${s.txnCount} categorized, ${s.pendingCount} still pending (${money(s.pendingAmount)} not yet allocated).`
      : `  All ${s.txnCount} transaction(s) categorized - nothing left pending.`,
  ];

  if (s.categories.length) {
    lines.push("", "BY CATEGORY (spent of allocated):");
    for (const c of s.categories) {
      const over = c.spent > c.allocated && c.allocated > 0 ? " - over plan" : "";
      lines.push(`  - ${c.name}: ${money(c.spent)} of ${money(c.allocated)}${over}.`);
    }
  } else {
    lines.push("", "No categories were set up this month.");
  }

  if (s.topMerchants.length) {
    lines.push("", "TOP SPENDS:");
    for (const m of s.topMerchants) {
      lines.push(`  - ${m.label}: ${money(m.amount)}.`);
    }
  }

  return lines.join("\n");
}

/**
 * Parse an OpenRouter chat-completion response into the plain-text summary.
 * Returns null on any malformed/empty result so callers can fall back.
 */
export function parseMonthlySummaryResponse(json: unknown): string | null {
  try {
    const content = (json as {
      choices?: { message?: { content?: unknown } }[];
    })?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;

    const text = content.trim();
    if (!text) return null;

    return text.slice(0, SUMMARY_MAX);
  } catch {
    return null;
  }
}
