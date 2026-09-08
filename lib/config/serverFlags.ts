import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_FLAGS, parseFlags, type AppFlags } from "@/lib/config/flags";

/**
 * Server-side read of the runtime flags.
 *
 * Cached in module memory for a minute: this sits in front of the AI chat
 * endpoint, and a Postgres round trip per message just to read four booleans
 * would be silly. A flip therefore takes up to 60s (plus instance spread) to
 * apply everywhere — acceptable for a kill switch.
 *
 * Uses the anon client on purpose: `app_config` has a public-read policy, so no
 * service role is needed to read it.
 */
const TTL_MS = 60_000;
let cache: { at: number; flags: AppFlags } | null = null;

export async function getServerFlags(): Promise<AppFlags> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.flags;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("app_config")
      .select("flags")
      .eq("id", 1)
      .single();
    if (error || !data) throw error ?? new Error("no app_config row");
    const flags = parseFlags(data.flags);
    cache = { at: Date.now(), flags };
    return flags;
  } catch {
    // Fail open — a DB blip must never dark a feature.
    return DEFAULT_FLAGS;
  }
}

/** Drops the memo so an admin flag write is visible on this instance at once. */
export function invalidateServerFlags() {
  cache = null;
}
