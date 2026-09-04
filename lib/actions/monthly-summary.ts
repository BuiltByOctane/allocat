"use server";

/**
 * Thin AI wrapper: turns the client-computed monthly report stats into a
 * plain-text recap for the report Notes field, via OpenRouter. Returns null on
 * any failure (no key, unauthenticated, network/model error, empty output) so
 * the caller can surface a retry hint. Does not touch the DB — the stats arrive
 * from IDB on the client; the auth check only gates use of the OpenRouter key.
 *
 * Mirrors `generateWeeklyInsight` in `insights.ts`. Rare (one tap per report,
 * button is hidden once Notes is filled), so it is not counted against the
 * daily AI message quota.
 */
import { createClient } from "@/lib/supabase/server";
import { openRouterChat } from "@/lib/server/openrouter";
import {
  MONTHLY_SUMMARY_SYSTEM,
  buildMonthlySummaryPrompt,
  parseMonthlySummaryResponse,
  type MonthlySummaryStats,
} from "@/lib/ai/monthlySummaryPrompt";

export async function generateMonthlySummary(
  stats: MonthlySummaryStats,
): Promise<string | null> {
  try {
    if (!process.env.OPENROUTER_API_KEY) return null;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const res = await openRouterChat({
      messages: [
        { role: "system", content: MONTHLY_SUMMARY_SYSTEM },
        { role: "user", content: buildMonthlySummaryPrompt(stats) },
      ],
    });
    if (!res.ok) return null;

    return parseMonthlySummaryResponse(await res.json());
  } catch {
    return null;
  }
}
