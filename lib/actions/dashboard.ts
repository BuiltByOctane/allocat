"use server";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type BudgetItemRow = Database["public"]["Tables"]["budget_items"]["Row"];
type CategoryWithItems = CategoryRow & { budget_items: BudgetItemRow[] | null };

export async function getDashboardData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: budget } = await supabase
    .from("budgets")
    .select("*, categories(*, budget_items(*))")
    .eq("user_id", user.id)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  let formattedBudget = null;
  const summaryCategories: { id: string; name: string; icon?: string | null }[] = [];

  if (budget) {
    let spent = 0;
    (budget.categories as CategoryWithItems[] | null)?.forEach((c) => {
      summaryCategories.push({
        id: c.id,
        name: c.name,
        icon: c.icon,
      });
      c.budget_items?.forEach((item) => {
        spent += Number(item.actual_amount || 0);
      });
    });

    formattedBudget = {
      id: budget.id,
      totalBudget: Number(budget.total_budget || 0),
      spent,
      remaining: Number(budget.total_budget || 0) - spent,
    };
  }

  const { data: netWorthHistory } = await supabase
    .from("net_worth_snapshots")
    .select("net_worth, snapshot_date")
    .eq("user_id", user.id)
    .order("snapshot_date", { ascending: true })
    .limit(12);

  const { data: goals } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at");

  return {
    budget: formattedBudget,
    categories: summaryCategories,
    goals: goals || [],
    netWorthHistory: netWorthHistory || [],
  };
}
