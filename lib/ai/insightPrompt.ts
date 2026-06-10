/**
 * Pure prompt-building + response-parsing for the weekly AI insight. Kept out of
 * the `"use server"` action so these can be unit-tested without network/Supabase.
 */
import { formatCurrency } from "@/lib/number-format";
import type { InsightStats } from "@/lib/sms/insightStats";

const TITLE_MAX = 60;
const BODY_MAX = 160;

export const INSIGHT_SYSTEM = [
  "You are AlloCat — a calm, observant financial companion. You write ONE short weekly insight notification from the user's real data below.",
  "",
  "PICK THE SINGLE MOST USEFUL ANGLE this week, in this priority:",
  "1. A category about to blow its budget (projected month-end spend exceeds its plan).",
  "2. A category already over budget.",
  "3. A goal worth nudging (close to target, or stalled).",
  "4. One concrete, doable suggestion (e.g. trim the top category, review pending spends).",
  "If nothing is concerning, give a brief, encouraging recap.",
  "",
  "RULES:",
  "- Never invent numbers. Only use figures from the data.",
  "- Be specific: include the relevant amount or percentage.",
  "- Calm, lightly witty, never preachy or guilt-inducing.",
  "- Format every amount with the currency code shown in the data.",
  "",
  "OUTPUT: a JSON object exactly like {\"title\":\"...\",\"body\":\"...\"}.",
  `- title: <= 40 chars, may start with ONE emoji.`,
  `- body: <= 120 chars, one sentence (two only if truly needed).`,
  "- No markdown, no extra keys, no text outside the JSON.",
].join("\n");

export function buildInsightPrompt(s: InsightStats): string {
  const money = (v: number) =>
    formatCurrency(v, { code: s.currency, maximumFractionDigits: 0 });
  const lines: string[] = [`Currency: ${s.currency}`, ""];

  lines.push("THIS WEEK:");
  lines.push(
    `  Spent ${money(s.weekTotal)} across ${s.weekCount} transaction(s); last week ${money(s.lastWeekTotal)}.`,
  );
  if (s.topCat) {
    lines.push(`  Biggest category: ${s.topCat} (${money(s.topCatAmt)}).`);
  }
  if (s.pendingCount > 0) {
    lines.push(`  ${s.pendingCount} spend(s) still uncategorized / awaiting review.`);
  }

  lines.push("", "THIS MONTH (budget pace):");
  if (s.monthBudget > 0) {
    lines.push(
      `  Budget ${money(s.monthBudget)}; spent ${money(s.monthSpent)} with ${s.daysLeft} of ${s.daysInMonth} days left.`,
    );
    lines.push(
      `  Projected month-end spend at this pace: ${money(s.projectedMonthSpend)}.`,
    );
    if (s.overCats.length) {
      lines.push("  Already over budget:");
      for (const c of s.overCats) {
        lines.push(`    - ${c.name}: spent ${money(c.actual)} of ${money(c.planned)}.`);
      }
    }
    if (s.paceRiskCats.length) {
      lines.push("  On track to exceed budget:");
      for (const c of s.paceRiskCats) {
        lines.push(`    - ${c.name}: ${money(c.actual)} of ${money(c.planned)} so far.`);
      }
    }
    if (!s.overCats.length && !s.paceRiskCats.length) {
      lines.push(`  All ${s.trackedCount} tracked categories on pace.`);
    }
  } else {
    lines.push("  No budget set for this month.");
  }

  if (s.goals.length) {
    lines.push("", "GOALS:");
    for (const g of s.goals) {
      lines.push(
        `  - ${g.name}: ${money(g.current)} of ${money(g.target)} (${g.pct}%).`,
      );
    }
  }

  return lines.join("\n");
}

/**
 * Parse an OpenRouter chat-completion response into a notification.
 * Returns null on any malformed/empty result so callers can fall back.
 */
export function parseInsightResponse(
  json: unknown,
): { title: string; body: string } | null {
  try {
    const content = (json as {
      choices?: { message?: { content?: unknown } }[];
    })?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;

    const parsed = JSON.parse(content) as { title?: unknown; body?: unknown };
    const title = String(parsed.title ?? "").trim();
    const body = String(parsed.body ?? "").trim();
    if (!title || !body) return null;

    return {
      title: title.slice(0, TITLE_MAX),
      body: body.slice(0, BODY_MAX),
    };
  } catch {
    return null;
  }
}
