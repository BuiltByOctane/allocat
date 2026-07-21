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
  const items: {
    id: string;
    name: string;
    emoji?: string | null;
    categoryId: string;
    planned: number;
    actual: number;
  }[] = [];

  if (budget) {
    let spent = 0;
    (budget.categories as CategoryWithItems[] | null)?.forEach((c) => {
      summaryCategories.push({ id: c.id, name: c.name, icon: c.icon });
      c.budget_items?.forEach((item) => {
        spent += Number(item.actual_amount || 0);
        items.push({
          id: item.id,
          name: item.name,
          emoji: item.emoji,
          categoryId: c.id,
          planned: Number(item.planned_amount || 0),
          actual: Number(item.actual_amount || 0),
        });
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

  // Goals are assets with is_goal=true; surface only active ones for dashboard.
  const { data: goalAssets } = await supabase
    .from("assets")
    .select("id, user_id, name, icon, value, target_amount, created_at, updated_at, achieved_at")
    .eq("user_id", user.id)
    .eq("is_goal", true)
    .is("achieved_at", null)
    .order("created_at");

  const goals = (goalAssets || []).map((a) => ({
    id: a.id,
    user_id: a.user_id,
    name: a.name,
    icon: a.icon,
    target_amount: Number(a.target_amount ?? 0),
    current_amount: Number(a.value ?? 0),
    notes: null,
    priority: 0,
    created_at: a.created_at,
    updated_at: a.updated_at,
  }));

  return {
    budget: formattedBudget,
    categories: summaryCategories,
    items,
    goals,
    netWorthHistory: netWorthHistory || [],
  };
}
