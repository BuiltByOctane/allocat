"use server";

/**
 * AI overspend message with static fallback.
 *
 * `generateOverspendMessage(d)` calls OpenRouter and returns a NotifMessage, or
 * null on ANY failure (no key, unauthenticated, network error, bad output, timeout).
 *
 * `resolveOverspendMessage(ctx)` is what server call sites use: AI when available,
 * exact static pool message (pickOverspendMessage) otherwise.
 */

import { createClient } from "@/lib/supabase/server";
import { openRouterChat } from "@/lib/server/openrouter";
import {
  OVERSPEND_SYSTEM,
  buildOverspendPrompt,
  parseOverspendResponse,
  toDerived,
  type OverspendDerived,
} from "@/lib/ai/overspendPrompt";
import {
  pickOverspendMessage,
  type OverspendCtx,
  type NotifMessage,
} from "@/lib/notify/messages";

// NOTE: this file is "use server" — every EXPORT must be an async function.
// Pure helpers (toDerived) live in lib/ai/overspendPrompt.ts; module-local
// non-exported helpers (timeout, constants) are allowed.
const AI_TIMEOUT_MS = 1500;

function timeout<T>(ms: number): Promise<T> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("ai-timeout")), ms),
  );
}

export async function generateOverspendMessage(
  d: OverspendDerived,
): Promise<NotifMessage | null> {
  try {
    if (!process.env.OPENROUTER_API_KEY) return null;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // openRouterChat returns a raw Response (see lib/server/openrouter.ts).
    // Mirror generateWeeklyInsight: check res.ok, then parse the envelope.
    const res = await Promise.race([
      openRouterChat({
        json: true,
        messages: [
          { role: "system", content: OVERSPEND_SYSTEM },
          { role: "user", content: buildOverspendPrompt(d) },
        ],
      }),
      timeout<Response>(AI_TIMEOUT_MS),
    ]);
    if (!res.ok) return null;
    return parseOverspendResponse(await res.json());
  } catch {
    return null; // ANY failure → null → caller uses static
  }
}

/** Server call sites use this: AI when available, exact static pool message otherwise. */
export async function resolveOverspendMessage(
  ctx: OverspendCtx,
): Promise<NotifMessage> {
  const ai = await generateOverspendMessage(toDerived(ctx)).catch(() => null);
  return ai ?? pickOverspendMessage(ctx);
}
