import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { RuleResolutionContext } from "@/lib/sms/resolveRuleItem";

/**
 * Load the resolver context (budget + its items) for the SMS's period — its
 * occurred_at month, falling back to now. Read-only: never creates a budget.
 * See lib/sms/resolveRuleItem.ts.
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
  const d = occurredAt ? new Date(occurredAt) : new Date();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();

  const { data: budget } = await supabase
    .from("budgets")
    .select("id, template_id")
    .eq("user_id", userId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

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
