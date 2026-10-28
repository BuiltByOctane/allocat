"use server";

import { createClient, getAuthedUser } from "@/lib/supabase/server";
import {
  clampStartDay,
  planStartDaySwitch,
  type ISODate,
  type SwitchPlan,
} from "@/lib/budget/period";
import {
  DEVICE_DATE_ERROR,
  STALE_PLAN_ERROR,
  isAcceptableClientDate,
  planMatchesExpected,
  type ExpectedSwitch,
} from "@/lib/budget/switchGuard";
import type { Json } from "@/lib/types/database";

export type SetBudgetStartDayResult =
  | { ok: true; plan: SwitchPlan | null }
  | { ok: false; error: string; stale?: true };

const GENERIC_ERROR = "Couldn't change your budget cycle. Please try again.";

/**
 * Switch the user's budget cycle start day (1–28).
 *
 * Called directly, not via the sync queue: the switch deletes and re-dates
 * budgets server-side in one transaction (`apply_budget_cycle_switch`), so it
 * must run against the server's current rows. The plan is always recomputed
 * here from the database — a client plan is never trusted.
 *
 * `today` is the client's LOCAL date (the server runs in UTC); it must be
 * within one day of the server's UTC date. `expected` is what the client
 * previewed: if the server's own plan would delete other budgets or end the
 * current one elsewhere (stale IDB, another device), nothing is applied and
 * `stale: true` asks the client to refresh and re-preview.
 */
export async function setBudgetStartDay(
  day: number,
  today: ISODate,
  expected: ExpectedSwitch,
): Promise<SetBudgetStartDayResult> {
  if (clampStartDay(day) !== day) return { ok: false, error: "Pick a day between 1 and 28." };

  if (!isAcceptableClientDate(today, new Date().toISOString().slice(0, 10))) {
    return { ok: false, error: DEVICE_DATE_ERROR };
  }
  if (
    !expected ||
    !Array.isArray(expected.deleteBudgetIds) ||
    !expected.deleteBudgetIds.every((id) => typeof id === "string") ||
    !(expected.currentEnd === null || typeof expected.currentEnd === "string")
  ) {
    return { ok: false, error: STALE_PLAN_ERROR, stale: true };
  }

  const user = await getAuthedUser();
  if (!user) return { ok: false, error: "You're signed out. Sign in and try again." };

  const supabase = await createClient();
  const [profileRes, budgetsRes] = await Promise.all([
    supabase.from("profiles").select("budget_start_day").eq("id", user.id).maybeSingle(),
    supabase
      .from("budgets")
      .select("id, month, year, period_start, period_end")
      .eq("user_id", user.id),
  ]);
  if (profileRes.error || budgetsRes.error) {
    console.error(
      "setBudgetStartDay: load failed:",
      profileRes.error?.message ?? budgetsRes.error?.message,
    );
    return { ok: false, error: GENERIC_ERROR };
  }

  const plan = planStartDaySwitch({
    today,
    oldStartDay: clampStartDay(profileRes.data?.budget_start_day),
    newStartDay: day,
    budgets: budgetsRes.data ?? [],
  });
  // Never delete a budget the user wasn't shown in the preview.
  if (!planMatchesExpected(plan, expected)) return { ok: false, error: STALE_PLAN_ERROR, stale: true };
  if (!plan) return { ok: true, plan: null };

  // The RPC errors on JSON-null arrays — always send arrays.
  const p_plan = {
    startDay: plan.startDay,
    current: plan.current,
    deleteBudgetIds: plan.deleteBudgetIds ?? [],
    redate: plan.redate ?? [],
  } as unknown as Json;

  const { error } = await supabase.rpc("apply_budget_cycle_switch", { p_plan });
  if (error) {
    console.error("setBudgetStartDay: rpc failed:", error.message);
    if (error.message.includes("budget_period_overlap")) {
      return {
        ok: false,
        error: "Your budgets changed while switching. Refresh and try again.",
      };
    }
    return { ok: false, error: GENERIC_ERROR };
  }

  return { ok: true, plan };
}
