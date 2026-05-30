import type { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/number-format";
import { DEFAULT_CURRENCY } from "@/lib/currency/catalog";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ActivityCategory = "budget" | "net_worth" | "goals" | "debts";

export async function logActivity(
  supabase: SupabaseClient,
  userId: string,
  payload: {
    action_type: string;
    category: ActivityCategory;
    title: string;
    description: string;
    metadata?: Record<string, unknown>;
  }
) {
  await supabase.from("activity_logs").insert({
    user_id: userId,
    action_type: payload.action_type,
    category: payload.category,
    title: payload.title,
    description: payload.description,
    metadata: payload.metadata ?? {},
  });
}

/**
 * Format a money value using the user's currency. Pass the code resolved
 * upstream via `getUserCurrency` so this stays synchronous.
 */
export function fmt(value: number, code: string = DEFAULT_CURRENCY) {
  return formatCurrency(value, {
    code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Fetch the user's display currency from the profiles table. */
export async function getUserCurrency(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("currency")
    .eq("id", userId)
    .maybeSingle();
  return data?.currency ?? DEFAULT_CURRENCY;
}
