"use server";

import { createClient, getAuthedUser } from "@/lib/supabase/server";
import {
  addDays,
  clampStartDay,
  planStartDaySwitch,
  type ISODate,
  type SwitchPlan,
} from "@/lib/budget/period";
import type { Json } from "@/lib/types/database";

export type SetBudgetStartDayResult =
  | { ok: true; plan: SwitchPlan | null }
  | { ok: false; error: string };

const GENERIC_ERROR = "Couldn't change your budget cycle. Please try again.";

/** A real calendar date in strict "YYYY-MM-DD" form. */
function isRealISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  // addDays round-trips through a day number, normalising e.g. 2026-02-30.
  return addDays(s, 0) === s;
}

/**
 * Switch the user's budget cycle start day (1–28).
 *
 * Called directly, not via the sync queue: the switch deletes and re-dates
 * budgets server-side in one transaction (`apply_budget_cycle_switch`), so it
 * must run against the server's current rows. The plan is always recomputed
 * here from the database — a client plan is never trusted.
 *
 * `today` is the client's LOCAL date (the server runs in UTC); it must be
 * within one day of the server's UTC date.
 */
export async function setBudgetStartDay(day: number, today: ISODate): Promise<SetBudgetStartDayResult> {
  if (clampStartDay(day) !== day) return { ok: false, error: "Pick a day between 1 and 28." };

  if (!isRealISODate(today)) return { ok: false, error: "Your device date looks wrong." };
  const serverToday = new Date().toISOString().slice(0, 10);
  if (today < addDays(serverToday, -1) || today > addDays(serverToday, 1)) {
    return { ok: false, error: "Your device date looks wrong. Check it and try again." };
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
