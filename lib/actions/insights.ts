"use server";

/**
 * Thin AI wrapper: turns the client-computed weekly stats into one short
 * insight notification via OpenRouter. Returns null on any failure (no key,
 * unauthenticated, network/model error, malformed output) so the caller falls
 * back to the offline template. Does not touch the DB — the stats arrive from
 * IDB on the client; the auth check only gates use of the OpenRouter key.
 */
import { getAuthedUser } from "@/lib/supabase/server";
import { openRouterChat } from "@/lib/server/openrouter";
import { rateLimit } from "@/lib/server/rateLimit";
import {
  INSIGHT_SYSTEM,
  buildInsightPrompt,
  parseInsightResponse,
} from "@/lib/ai/insightPrompt";
import type { InsightStats } from "@/lib/sms/insightStats";

export async function generateWeeklyInsight(
  stats: InsightStats,
): Promise<{ title: string; body: string } | null> {
  try {
    if (!process.env.OPENROUTER_API_KEY) return null;

    const user = await getAuthedUser();
    if (!user) return null;

    // The client caches the result for a week; anything above a handful per
    // hour is a loop, not a user.
    if (!rateLimit(`insight:${user.id}`, 5, 60 * 60 * 1000).ok) return null;

    const res = await openRouterChat({
      json: true,
      messages: [
        { role: "system", content: INSIGHT_SYSTEM },
        { role: "user", content: buildInsightPrompt(stats) },
      ],
    });
    if (!res.ok) return null;

    return parseInsightResponse(await res.json());
  } catch {
    return null;
  }
}
