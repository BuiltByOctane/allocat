import { useQuery } from "@tanstack/react-query";
import { getDB } from "@/lib/db";
import { getCategoryData } from "@/lib/actions/budget";

export function categoryDataKey(categoryId: string) {
  return ["categoryData", categoryId] as const;
}

async function getCategoryFromIDB(categoryId: string) {
  const db = getDB();

  const category = await db.categories.get(categoryId);
  if (!category) return null;

  const budget = await db.budgets.get(category.budget_id);
  if (!budget) return null;

  const allCategories = await db.categories
    .where("budget_id")
    .equals(category.budget_id)
    .toArray();

  const items = await db.budget_items
    .where("category_id")
    .equals(categoryId)
    .toArray();

  // Use category.allocated_amount directly — no need to sum other categories' items
  const otherAllocated = allCategories.reduce((s, cat) => {
    if (cat.id === categoryId) return s;
    return s + Number(cat.allocated_amount);
  }, 0);

  return {
    id: category.id,
    name: category.name,
    icon: category.icon,
    type: category.type,
    categoryAllocation: Number(category.allocated_amount),
    totalBudget: Number(budget.total_budget),
    otherAllocated,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      planned: Number(item.planned_amount),
      actual: Number(item.actual_amount),
      is_completed: item.is_completed,
      notes: item.notes ?? null,
      link_type: (item.link_type as "asset" | "debt" | null) ?? null,
      link_id: item.link_id ?? null,
    })),
  };
}

export function useCategoryData(categoryId: string) {
  return useQuery({
    queryKey: categoryDataKey(categoryId),
    queryFn: async () => {
      const local = await getCategoryFromIDB(categoryId);
      if (local) return local;
      // IDB miss — fall back to server (only on first ever load or cache clear)
      return getCategoryData(categoryId);
    },
    enabled: !!categoryId,
  });
}
