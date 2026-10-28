import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { RuleResolutionContext } from "@/lib/sms/resolveRuleItem";
import { resolveServerPeriod, serverBudgetIdForPeriod } from "@/lib/server/budget-period";
import { toISODate } from "@/lib/budget/period";

/**
 * Load the resolver context (budget + its items) for the SMS's period — the
 * budget cycle containing its occurred_at, falling back to now. Read-only:
 * never creates a budget. See lib/sms/resolveRuleItem.ts.
 *
 * Shared by the cookie-authed SMS actions and the iPhone shortcut endpoint,
 * which runs on the service-role client. Every query is therefore scoped by
 * `user_id` explicitly rather than relying on RLS.
 */
export async function loadPeriodContext(
  supabase: SupabaseClient<Database>,
  userId: string,
  occurredAt: string | null | undefined,
): Promise<RuleResolutionContext> {
  const parsed = occurredAt ? new Date(occurredAt) : new Date();
  const d = isNaN(parsed.getTime()) ? new Date() : parsed;
  const period = await resolveServerPeriod(supabase, userId, d);

  const budgetId = await serverBudgetIdForPeriod(supabase, userId, period, toISODate(d));
  const { data: budget } = budgetId
    ? await supabase
        .from("budgets")
        .select("id, template_id")
        .eq("user_id", userId)
        .eq("id", budgetId)
        .maybeSingle()
    : { data: null };

  let items: RuleResolutionContext["items"] = [];
  if (budget) {
    const { data: cats } = await supabase
      .from("categories")
      .select("id")
      .eq("budget_id", budget.id)
      .eq("user_id", userId);
    const catIds = (cats ?? []).map((c) => c.id);
    if (catIds.length > 0) {
      const { data: rows } = await supabase
        .from("budget_items")
        .select("id, template_id, template_item_id")
        .in("category_id", catIds)
        .eq("user_id", userId);
      items = rows ?? [];
    }
  }

  return { budget: budget ?? null, items };
}
