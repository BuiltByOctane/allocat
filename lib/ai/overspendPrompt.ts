import type { OverspendCtx } from "@/lib/notify/messages";

const TITLE_MAX = 40;
const BODY_MAX = 120;

export interface OverspendDerived {
  itemName: string;
  amount: number; // the spend that triggered this
  count: number; // overspend count this month
  tier: 1 | 2 | 3;
  currency: string;
  over: number; // actual - planned
  remaining?: number;
}

export const OVERSPEND_SYSTEM = [
  "You are AlloCat, a calm, observant financial companion (a cat).",
  "Write a short push notification about a budget item going over plan.",
  "Tone: warm, lightly witty, never guilt-inducing or preachy.",
  "Tier 1 = first overspend: gently note the overflow comes from other allocations or savings.",
  "Tier 2 = repeated: a sharper but kind nudge. Tier 3 = persistent: suggest re-planning.",
  "Use ONLY the numbers provided. Never invent amounts, dates, merchants, or counts.",
  `Output strict JSON only: {"title": string, "body": string}.`,
  `title <= ${TITLE_MAX} chars, body <= ${BODY_MAX} chars.`,
  "Do NOT use the em-dash character. Use periods or commas instead.",
].join(" ");

/**
 * Map the notification context to the privacy-safe derived fields the AI prompt uses.
 * Lives here (a pure module) rather than in the "use server" action file, where every
 * export must be an async function.
 */
export function toDerived(ctx: OverspendCtx): OverspendDerived {
  return {
    itemName: ctx.itemName,
    amount: ctx.over, // the triggering over amount
    count: ctx.count,
    tier: ctx.tier,
    currency: ctx.currency,
    over: ctx.over,
  };
}

export function buildOverspendPrompt(d: OverspendDerived): string {
  return JSON.stringify({
    item: d.itemName,
    spend: d.amount,
    overBy: d.over,
    overspendCountThisMonth: d.count,
    tier: d.tier,
    currency: d.currency,
    remaining: d.remaining ?? 0,
  });
}

// Mirrors parseInsightResponse: unwrap the OpenRouter envelope, JSON.parse the
// content string, validate, strip any em-dash, and clamp lengths.
export function parseOverspendResponse(
  json: unknown,
): { title: string; body: string } | null {
  try {
    const content = (json as {
      choices?: { message?: { content?: unknown } }[];
    })?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    const parsed = JSON.parse(content) as { title?: unknown; body?: unknown };
    const title = String(parsed.title ?? "").replace(/—/g, "-").trim().slice(0, TITLE_MAX);
    const body = String(parsed.body ?? "").replace(/—/g, "-").trim().slice(0, BODY_MAX);
    if (!title || !body) return null;
    return { title, body };
  } catch {
    return null;
  }
}
