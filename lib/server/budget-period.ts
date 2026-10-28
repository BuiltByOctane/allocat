import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  clampStartDay,
  pickBudgetForPeriod,
  resolvePeriod,
  toISODate,
  type ISODate,
  type ResolvedPeriod,
  type StoredBudgetPeriod,
} from "@/lib/budget/period";

/**
 * Server-side period lookups. Shared by the cookie-authed actions and the
 * iPhone shortcut endpoint (service-role client), so every query filters by
 * `user_id` explicitly instead of relying on RLS.
 */

const COLS = "id, month, year, period_start, period_end";

export async function getServerStartDay(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<number> {
  const { data } = await supabase
    .from("profiles")
    .select("budget_start_day")
    .eq("id", userId)
    .maybeSingle();
  return clampStartDay(data?.budget_start_day);
}

/**
 * The cycle containing `date` (default now). A timestamp uses its date in the
 * server's local timezone (known limitation); "YYYY-MM-DD" is used as-is.
 * Reads the covering budget if any, else the nearest neighbours either side so
 * the computed fallback is clipped exactly as `resolvePeriod` does.
 */
export async function resolveServerPeriod(
  supabase: SupabaseClient<Database>,
  userId: string,
  date?: Date | string | null,
): Promise<ResolvedPeriod> {
  const iso: ISODate =
    typeof date === "string"
      ? /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : toISODate(new Date(date))
      : toISODate(date ?? new Date());

  const startDay = await getServerStartDay(supabase, userId);

  const { data: covering } = await supabase
    .from("budgets")
    .select(COLS)
    .eq("user_id", userId)
    .lte("period_start", iso)
    .gte("period_end", iso)
    .limit(1);
  if (covering && covering.length > 0) {
    return resolvePeriod(iso, covering as StoredBudgetPeriod[], startDay);
  }

  const [before, after] = await Promise.all([
    supabase
      .from("budgets")
      .select(COLS)
      .eq("user_id", userId)
      .lt("period_end", iso)
      .order("period_end", { ascending: false })
      .limit(1),
    supabase
      .from("budgets")
      .select(COLS)
      .eq("user_id", userId)
      .gt("period_start", iso)
      .order("period_start", { ascending: true })
      .limit(1),
  ]);
  const neighbours = [...(before.data ?? []), ...(after.data ?? [])] as StoredBudgetPeriod[];
  return resolvePeriod(iso, neighbours, startDay);
}

/**
 * The id of the budget row behind `period`: `period.budgetId` when set, else a
 * row with the same label whose stored range contains `date` (the date
 * `period` was resolved for). Null when no such row exists.
 */
export async function serverBudgetIdForPeriod(
  supabase: SupabaseClient<Database>,
  userId: string,
  period: ResolvedPeriod,
  date: ISODate,
): Promise<string | null> {
  if (period.budgetId) return period.budgetId;
  const { data } = await supabase
    .from("budgets")
    .select(COLS)
    .eq("user_id", userId)
    .eq("month", period.month)
    .eq("year", period.year);
  return pickBudgetForPeriod(period, (data ?? []) as StoredBudgetPeriod[], date)?.id ?? null;
}
