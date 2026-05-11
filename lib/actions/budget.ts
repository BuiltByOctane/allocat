"use server";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";
import { logActivity, fmt } from "@/lib/server/activity-logger";
import { notifyUser } from "@/lib/server/push-notify";
import { computeAutoCompletion } from "@/lib/utils/budget-completion";
import { addAssetEntry } from "@/lib/actions/asset-history";
import { makePayment } from "@/lib/actions/debt";

type LinkType = "asset" | "debt";

async function validateBudgetItemLink(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  linkType: LinkType,
  linkId: string
) {
  const tableMap: Record<LinkType, "assets" | "debts"> = {
    asset: "assets",
    debt: "debts",
  };
  const { data, error } = await supabase
    .from(tableMap[linkType])
    .select("id")
    .eq("id", linkId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Linked ${linkType} not found`);
}

type BudgetItemRow = Database["public"]["Tables"]["budget_items"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type CategoryWithItems = CategoryRow & {
  budget_items: BudgetItemRow[] | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ─── Category-level allocation context (for setting category.allocated_amount) ──

async function getBudgetAllocationContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string
) {
  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id, budget_id, allocated_amount")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .single();

  if (categoryError) throw new Error(categoryError.message);

  const { data: budget, error: budgetError } = await supabase
    .from("budgets")
    .select("total_budget")
    .eq("id", category.budget_id)
    .eq("user_id", userId)
    .single();

  if (budgetError) throw new Error(budgetError.message);

  const { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select("id, allocated_amount")
    .eq("budget_id", category.budget_id)
    .eq("user_id", userId);

  if (categoriesError) throw new Error(categoriesError.message);

  const otherAllocated = (categories || []).reduce((sum, cat) => {
    if (cat.id === categoryId) return sum;
    return sum + Number(cat.allocated_amount || 0);
  }, 0);

  const currentCategoryAllocated = Number(category.allocated_amount || 0);

  return {
    budgetId: category.budget_id,
    totalBudget: Number(budget.total_budget || 0),
    currentCategoryAllocated,
    otherAllocated,
    totalAllocated: otherAllocated + currentCategoryAllocated,
  };
}

function validateBudgetAllocationChange(
  context: Awaited<ReturnType<typeof getBudgetAllocationContext>>,
  nextCategoryAllocated: number
) {
  const nextTotalAllocated = context.otherAllocated + nextCategoryAllocated;
  const isIncreasingPastBudget =
    nextTotalAllocated > context.totalBudget &&
    nextTotalAllocated > context.totalAllocated;

  if (!isIncreasingPastBudget) return;

  if (context.totalBudget <= 0) {
    throw new Error("Set the Total Budget before allocating more to categories.");
  }

  const overBy = nextTotalAllocated - context.totalBudget;
  throw new Error(
    `This exceeds the total budget by ${formatCurrency(overBy)}. Reduce another category or increase the total budget first.`
  );
}

// ─── Item-level allocation context (for setting item.planned_amount) ────────────

async function getItemAllocationContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string,
  excludeItemId: string | null = null
) {
  const { data: category, error: catError } = await supabase
    .from("categories")
    .select("allocated_amount")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .single();

  if (catError) throw new Error(catError.message);

  const { data: items, error: itemsError } = await supabase
    .from("budget_items")
    .select("id, planned_amount")
    .eq("category_id", categoryId)
    .eq("user_id", userId);

  if (itemsError) throw new Error(itemsError.message);

  const otherItemsPlanned = (items || [])
    .filter((i) => i.id !== excludeItemId)
    .reduce((s, i) => s + Number(i.planned_amount || 0), 0);

  return {
    categoryAllocation: Number(category?.allocated_amount || 0),
    otherItemsPlanned,
  };
}

function validateItemAllocationChange(
  categoryAllocation: number,
  otherItemsPlanned: number,
  newPlanned: number
) {
  if (categoryAllocation <= 0) return; // No cap set — allow any amount
  const nextTotal = otherItemsPlanned + newPlanned;
  if (nextTotal > categoryAllocation) {
    throw new Error(
      `Items exceed the category budget of ${formatCurrency(categoryAllocation)} by ${formatCurrency(nextTotal - categoryAllocation)}. Increase the category budget first.`
    );
  }
}

// ─── Public actions ──────────────────────────────────────────────────────────

export async function getBudgetForPeriod(month: number, year: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  let { data: budget } = await supabase
    .from("budgets")
    .select("*")
    .eq("user_id", user.id)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  if (!budget) {
    const { data: newBudget } = await supabase
      .from("budgets")
      .insert({ user_id: user.id, month, year, total_budget: 0 })
      .select()
      .single();
    budget = newBudget;
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("*, budget_items(*)")
    .eq("budget_id", budget!.id)
    .order("created_at");

  const formattedCategories = ((categories || []) as CategoryWithItems[]).map((cat) => {
    const spent = (cat.budget_items || []).reduce(
      (s, item) => s + Number(item.actual_amount || 0),
      0
    );
    return {
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      type: cat.type,
      allocated: Number(cat.allocated_amount || 0),
      spent,
      subtitle: `${cat.budget_items?.length || 0} items`,
    };
  });

  return {
    id: budget!.id,
    month: budget!.month,
    year: budget!.year,
    totalBudget: Number(budget!.total_budget || 0),
    categories: formattedCategories,
  };
}

export async function addBudgetCategory(
  budgetId: string,
  name: string,
  type: Database["public"]["Tables"]["categories"]["Insert"]["type"] = "misc",
  allocated_amount: number = 0
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Category name is required");

  const { data, error } = await supabase
    .from("categories")
    .insert({
      budget_id: budgetId,
      user_id: user.id,
      name: trimmedName,
      type,
      allocated_amount,
      icon: null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, {
    action_type: "category_added",
    category: "budget",
    title: `Created category "${trimmedName}"`,
    description: `New ${type} budget category "${trimmedName}" created`,
    metadata: { categoryId: data.id, name: trimmedName, type, allocated_amount },
  });

  return data;
}

export async function updateBudgetTotal(budgetId: string, totalAmount: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (totalAmount < 0) {
    throw new Error("Total budget must be 0 or more.");
  }

  const { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select("allocated_amount")
    .eq("budget_id", budgetId)
    .eq("user_id", user.id);

  if (categoriesError) throw new Error(categoriesError.message);

  const totalAllocated = (categories || []).reduce(
    (sum, cat) => sum + Number(cat.allocated_amount || 0),
    0
  );

  if (totalAmount < totalAllocated) {
    throw new Error(
      `Total budget can't be lower than the allocated amount of ${formatCurrency(totalAllocated)}. Reduce category allocations first.`
    );
  }

  const { data, error } = await supabase
    .from("budgets")
    .update({ total_budget: totalAmount })
    .eq("id", budgetId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, {
    action_type: "budget_total_updated",
    category: "budget",
    title: `Set total budget to ${fmt(totalAmount)}`,
    description: `Total budget updated to ${fmt(totalAmount)}`,
    metadata: { budgetId, totalAmount },
  });

  return data;
}

export async function updateCategoryAllocation(categoryId: string, allocatedAmount: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (allocatedAmount < 0) throw new Error("Allocation must be 0 or more.");

  const allocationContext = await getBudgetAllocationContext(supabase, user.id, categoryId);
  validateBudgetAllocationChange(allocationContext, allocatedAmount);

  const { data, error } = await supabase
    .from("categories")
    .update({ allocated_amount: allocatedAmount })
    .eq("id", categoryId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, {
    action_type: "category_allocation_updated",
    category: "budget",
    title: `Set "${data.name}" allocation to ${fmt(allocatedAmount)}`,
    description: `Budget allocation for "${data.name}" updated to ${fmt(allocatedAmount)}`,
    metadata: { categoryId, name: data.name, allocated_amount: allocatedAmount },
  });

  return data;
}

export async function updateCategoryIcon(categoryId: string, icon: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("categories")
    .update({ icon })
    .eq("id", categoryId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateCategoryName(categoryId: string, name: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("categories")
    .update({ name })
    .eq("id", categoryId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, {
    action_type: "category_renamed",
    category: "budget",
    title: `Renamed category to "${name}"`,
    description: `Budget category renamed to "${name}"`,
    metadata: { categoryId, name },
  });

  return data;
}

export async function deleteCategory(categoryId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: cat } = await supabase
    .from("categories")
    .select("name")
    .eq("id", categoryId)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, {
    action_type: "category_deleted",
    category: "budget",
    title: `Deleted category "${cat?.name ?? categoryId}"`,
    description: `Budget category "${cat?.name ?? categoryId}" was deleted`,
    metadata: { categoryId, name: cat?.name ?? null },
  });

  return true;
}

export async function addBudgetItem(
  categoryId: string,
  name: string,
  planned: number = 0,
  link?: { link_type: LinkType; link_id: string } | null
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Item name is required");
  if (planned < 0) throw new Error("Allocation must be 0 or more.");

  const itemContext = await getItemAllocationContext(supabase, user.id, categoryId, null);
  validateItemAllocationChange(itemContext.categoryAllocation, itemContext.otherItemsPlanned, Number(planned || 0));

  if (link) {
    await validateBudgetItemLink(supabase, user.id, link.link_type, link.link_id);
  }

  const { data, error } = await supabase
    .from("budget_items")
    .insert({
      category_id: categoryId,
      user_id: user.id,
      name: trimmedName,
      planned_amount: planned,
      actual_amount: 0,
      is_completed: false,
      notes: null,
      link_type: link?.link_type ?? null,
      link_id: link?.link_id ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, {
    action_type: "budget_item_added",
    category: "budget",
    title: `Added "${trimmedName}" to budget`,
    description: `New budget item "${trimmedName}" created with planned amount ${fmt(planned)}`,
    metadata: {
      itemId: data.id,
      name: trimmedName,
      categoryId,
      planned_amount: planned,
      ...(link ? { link_type: link.link_type, link_id: link.link_id } : {}),
    },
  });

  return data;
}

export async function updateBudgetItem(
  itemId: string,
  updates: {
    name?: string;
    planned_amount?: number;
    actual_amount?: number;
    is_completed?: boolean;
    notes?: string | null;
    link_type?: LinkType | null;
    link_id?: string | null;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: existingItem, error: existingItemError } = await supabase
    .from("budget_items")
    .select("id, category_id, planned_amount, actual_amount, is_completed, link_type, link_id, name")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .single();

  if (existingItemError) throw new Error(existingItemError.message);

  if (updates.name !== undefined && !updates.name.trim()) {
    throw new Error("Item name is required");
  }

  if (updates.planned_amount !== undefined) {
    if (updates.planned_amount < 0) {
      throw new Error("Allocation must be 0 or more.");
    }
    const itemContext = await getItemAllocationContext(
      supabase,
      user.id,
      existingItem.category_id,
      itemId
    );
    validateItemAllocationChange(
      itemContext.categoryAllocation,
      itemContext.otherItemsPlanned,
      Number(updates.planned_amount)
    );
  }

  if (updates.link_type !== undefined && updates.link_type !== null) {
    if (!updates.link_id) throw new Error("link_id is required when link_type is set");
    await validateBudgetItemLink(supabase, user.id, updates.link_type, updates.link_id);
  }

  const finalUpdates: typeof updates = { ...updates };
  if (
    (updates.actual_amount !== undefined || updates.planned_amount !== undefined) &&
    updates.is_completed === undefined
  ) {
    const planned =
      updates.planned_amount !== undefined
        ? Number(updates.planned_amount)
        : Number(existingItem.planned_amount);
    const actual =
      updates.actual_amount !== undefined
        ? Number(updates.actual_amount)
        : Number(existingItem.actual_amount);
    const auto = computeAutoCompletion(
      planned,
      actual,
      Boolean(existingItem.is_completed)
    );
    if (auto !== Boolean(existingItem.is_completed)) {
      finalUpdates.is_completed = auto;
    }
  }

  const { data, error } = await supabase
    .from("budget_items")
    .update({
      ...finalUpdates,
      ...(finalUpdates.name !== undefined ? { name: finalUpdates.name.trim() } : {}),
    })
    .eq("id", itemId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Cascade on positive actual_amount delta when item is linked.
  // Use post-update link state (allows changing link in same call).
  const effectiveLinkType =
    (updates.link_type !== undefined ? updates.link_type : existingItem.link_type) as
      LinkType | null;
  const effectiveLinkId =
    (updates.link_id !== undefined ? updates.link_id : existingItem.link_id) as
      string | null;

  if (
    updates.actual_amount !== undefined &&
    effectiveLinkType &&
    effectiveLinkId &&
    Number(updates.actual_amount) > Number(existingItem.actual_amount)
  ) {
    const delta = Number(updates.actual_amount) - Number(existingItem.actual_amount);
    try {
      if (effectiveLinkType === "asset") {
        await addAssetEntry(effectiveLinkId, "add_funds", delta, `Budget: ${data.name}`, undefined, { suppressLog: true });
      } else if (effectiveLinkType === "debt") {
        await makePayment(effectiveLinkId, delta, { suppressLog: true });
      }
    } catch (cascadeErr) {
      // Revert the budget item update so the client can retry cleanly
      await supabase
        .from("budget_items")
        .update({
          actual_amount: existingItem.actual_amount,
          is_completed: existingItem.is_completed,
        })
        .eq("id", itemId)
        .eq("user_id", user.id);
      throw cascadeErr;
    }
  }

  const itemName = data.name;
  let title: string;
  let action_type: string;

  if (updates.is_completed !== undefined) {
    action_type = updates.is_completed ? "budget_item_completed" : "budget_item_uncompleted";
    title = updates.is_completed
      ? `Marked "${itemName}" as complete`
      : `Marked "${itemName}" as incomplete`;
  } else if (updates.actual_amount !== undefined) {
    action_type = "budget_item_spend_updated";
    title = `Updated spend for "${itemName}" to ${fmt(updates.actual_amount)}`;
  } else if (updates.planned_amount !== undefined) {
    action_type = "budget_item_allocation_updated";
    title = `Set "${itemName}" planned amount to ${fmt(updates.planned_amount)}`;
  } else if (updates.name !== undefined) {
    action_type = "budget_item_renamed";
    title = `Renamed item to "${updates.name.trim()}"`;
  } else {
    action_type = "budget_item_updated";
    title = `Updated "${itemName}"`;
  }

  await logActivity(supabase, user.id, {
    action_type,
    category: "budget",
    title,
    description: title,
    metadata: {
      itemId,
      name: itemName,
      ...(updates.actual_amount !== undefined ? { actual_amount: updates.actual_amount } : {}),
      ...(updates.planned_amount !== undefined ? { planned_amount: updates.planned_amount } : {}),
      ...(updates.notes !== undefined && updates.notes !== null ? { note: updates.notes } : {}),
    },
  });

  return data;
}

export async function deleteBudgetItem(itemId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: item } = await supabase
    .from("budget_items")
    .select("name, category_id")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase
    .from("budget_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, {
    action_type: "budget_item_deleted",
    category: "budget",
    title: `Deleted "${item?.name ?? itemId}"`,
    description: `Budget item "${item?.name ?? itemId}" was deleted`,
    metadata: { itemId, name: item?.name ?? null, categoryId: item?.category_id ?? null },
  });

  return true;
}

export async function getCategoryItems(categoryId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("budget_items")
    .select("*")
    .eq("category_id", categoryId)
    .eq("user_id", user.id)
    .order("created_at");

  if (error) throw new Error(error.message);

  return data.map((item) => ({
    ...item,
    planned: item.planned_amount,
    remaining: item.planned_amount - item.actual_amount,
  }));
}

export async function quickLogSpend(itemId: string, amount: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: item } = await supabase
    .from("budget_items")
    .select("*")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .single();

  if (!item) throw new Error("Item not found");

  const previousActual = Number(item.actual_amount);
  const previousCompleted = Boolean(item.is_completed);
  const newActual = previousActual + Number(amount);
  const planned = Number(item.planned_amount);
  const nextCompleted = computeAutoCompletion(planned, newActual, previousCompleted);

  const { data: updatedItem, error } = await supabase
    .from("budget_items")
    .update({ actual_amount: newActual, is_completed: nextCompleted })
    .eq("id", itemId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Cascade to linked target. If cascade fails, revert the item update.
  let cascadeSummary: { kind: "asset" | "goal" | "debt"; targetName: string } | null = null;
  const linkType = item.link_type as LinkType | null | undefined;
  const linkId = item.link_id as string | null | undefined;

  if (linkType && linkId) {
    try {
      if (linkType === "asset") {
        const { data: asset } = await supabase
          .from("assets")
          .select("name")
          .eq("id", linkId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!asset) throw new Error("Linked asset missing");
        await addAssetEntry(linkId, "add_funds", Number(amount), `Budget: ${item.name}`, undefined, { suppressLog: true });
        cascadeSummary = { kind: "asset", targetName: asset.name };
      } else if (linkType === "debt") {
        const { data: debt } = await supabase
          .from("debts")
          .select("name")
          .eq("id", linkId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!debt) throw new Error("Linked debt missing");
        await makePayment(linkId, Number(amount), { suppressLog: true });
        cascadeSummary = { kind: "debt", targetName: debt.name };
      }
    } catch (cascadeErr) {
      // Revert the item update so client retry doesn't double-spend
      await supabase
        .from("budget_items")
        .update({ actual_amount: previousActual, is_completed: previousCompleted })
        .eq("id", itemId)
        .eq("user_id", user.id);
      throw cascadeErr;
    }
  }

  if (cascadeSummary) {
    await logActivity(supabase, user.id, {
      action_type: "budget_linked_spend",
      category: "budget",
      title: `Logged ${fmt(amount)} on "${updatedItem.name}" → ${cascadeSummary.targetName}`,
      description: `${fmt(amount)} from "${updatedItem.name}" applied to ${cascadeSummary.kind} "${cascadeSummary.targetName}"`,
      metadata: {
        itemId,
        itemName: updatedItem.name,
        amount,
        newTotal: updatedItem.actual_amount,
        link_type: cascadeSummary.kind,
        link_id: linkId,
        targetName: cascadeSummary.targetName,
      },
    });
  } else {
    await logActivity(supabase, user.id, {
      action_type: "spend_logged",
      category: "budget",
      title: `Logged ${fmt(amount)} spend on "${updatedItem.name}"`,
      description: `${fmt(amount)} spent on "${updatedItem.name}"`,
      metadata: {
        itemId,
        itemName: updatedItem.name,
        amount,
        newTotal: updatedItem.actual_amount,
      },
    });
  }

  // Push: budget overrun alert (fire on transition only).
  if (planned > 0 && previousActual <= planned && newActual > planned) {
    const over = newActual - planned;
    notifyUser(user.id, {
      title: "Budget overrun",
      body: `${updatedItem.name} is ${fmt(over)} over plan.`,
      tag: `overrun-${itemId}`,
      url: "/budget",
    }).catch(() => {});
  }

  return {
    itemName: updatedItem.name,
    remaining: updatedItem.planned_amount - updatedItem.actual_amount,
    planned: updatedItem.planned_amount,
    actual: updatedItem.actual_amount,
    cascade: cascadeSummary,
  };
}

// ─── Bulk template setup ─────────────────────────────────────────────────────

type TemplateSetupCategoryInput = {
  tempId: string;
  name: string;
  icon: string | null;
  type: Database["public"]["Tables"]["categories"]["Insert"]["type"];
  allocated_amount: number;
  items: Array<{ tempId: string; name: string; planned: number }>;
};

export async function setupBudgetFromTemplate(
  budgetId: string,
  totalBudget: number,
  categories: TemplateSetupCategoryInput[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (totalBudget < 0) throw new Error("Total budget must be 0 or more.");

  const totalAllocated = categories.reduce(
    (s, c) => s + Number(c.allocated_amount || 0),
    0
  );
  if (totalBudget > 0 && totalAllocated > totalBudget) {
    throw new Error(
      `Category allocations exceed total budget by ${formatCurrency(totalAllocated - totalBudget)}.`
    );
  }

  // 1. Update budget total (only if non-zero)
  if (totalBudget > 0) {
    const { error: budgetErr } = await supabase
      .from("budgets")
      .update({ total_budget: totalBudget })
      .eq("id", budgetId)
      .eq("user_id", user.id);
    if (budgetErr) throw new Error(budgetErr.message);
  }

  // 2. Bulk insert categories
  const categoryRows = categories
    .filter((c) => c.name.trim())
    .map((c) => ({
      budget_id: budgetId,
      user_id: user.id,
      name: c.name.trim(),
      icon: c.icon,
      type: c.type,
      allocated_amount: Number(c.allocated_amount || 0),
    }));

  let insertedCategories: CategoryRow[] = [];
  if (categoryRows.length > 0) {
    const { data, error } = await supabase
      .from("categories")
      .insert(categoryRows)
      .select();
    if (error) throw new Error(error.message);
    insertedCategories = (data ?? []) as CategoryRow[];
  }

  // Map tempId → realId by index (insert preserves order)
  const filteredCats = categories.filter((c) => c.name.trim());
  const categoryIdMap = filteredCats.map((c, i) => ({
    tempId: c.tempId,
    realId: insertedCategories[i]!.id,
    record: insertedCategories[i]!,
  }));
  const tempToRealCat = new Map(
    categoryIdMap.map((m) => [m.tempId, m.realId])
  );

  // 3. Bulk insert items
  const itemInputs: Array<{
    tempId: string;
    realCatId: string;
    name: string;
    planned: number;
  }> = [];
  for (const c of filteredCats) {
    const realCatId = tempToRealCat.get(c.tempId)!;
    for (const item of c.items) {
      const trimmed = item.name.trim();
      if (!trimmed) continue;
      itemInputs.push({
        tempId: item.tempId,
        realCatId,
        name: trimmed,
        planned: Number(item.planned || 0),
      });
    }
  }

  let insertedItems: BudgetItemRow[] = [];
  if (itemInputs.length > 0) {
    const itemRows = itemInputs.map((i) => ({
      category_id: i.realCatId,
      user_id: user.id,
      name: i.name,
      planned_amount: i.planned,
      actual_amount: 0,
      is_completed: false,
      notes: null,
    }));
    const { data, error } = await supabase
      .from("budget_items")
      .insert(itemRows)
      .select();
    if (error) throw new Error(error.message);
    insertedItems = (data ?? []) as BudgetItemRow[];
  }

  const itemIdMap = itemInputs.map((i, idx) => ({
    tempId: i.tempId,
    realId: insertedItems[idx]!.id,
    record: insertedItems[idx]!,
  }));

  // 4. One summary activity log
  await logActivity(supabase, user.id, {
    action_type: "budget_template_applied",
    category: "budget",
    title: `Set up budget with ${categoryIdMap.length} categories`,
    description: `Created ${categoryIdMap.length} categories and ${itemIdMap.length} items${totalBudget > 0 ? ` with total budget ${fmt(totalBudget)}` : ""}`,
    metadata: {
      budgetId,
      totalBudget,
      categoryCount: categoryIdMap.length,
      itemCount: itemIdMap.length,
    },
  });

  return {
    budgetId,
    totalBudget,
    categoryIdMap: categoryIdMap.map(({ tempId, realId, record }) => ({
      tempId,
      realId,
      record,
    })),
    itemIdMap: itemIdMap.map(({ tempId, realId, record }) => ({
      tempId,
      realId,
      record,
    })),
  };
}

export async function getCategoryData(categoryId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: category } = await supabase
    .from("categories")
    .select("*, budget_items(*)")
    .eq("id", categoryId)
    .eq("user_id", user.id)
    .single();

  if (!category) return null;

  const categoryWithItems = category as CategoryWithItems;
  const allocationContext = await getBudgetAllocationContext(supabase, user.id, categoryId);

  return {
    id: categoryWithItems.id,
    name: categoryWithItems.name,
    icon: categoryWithItems.icon,
    type: categoryWithItems.type,
    categoryAllocation: Number(categoryWithItems.allocated_amount || 0),
    totalBudget: allocationContext.totalBudget,
    otherAllocated: allocationContext.otherAllocated,
    items: (categoryWithItems.budget_items || []).map((item) => ({
      id: item.id,
      name: item.name,
      planned: Number(item.planned_amount || 0),
      actual: Number(item.actual_amount || 0),
      is_completed: item.is_completed,
      notes: item.notes ?? null,
      link_type: item.link_type ?? null,
      link_id: item.link_id ?? null,
    })),
  };
}
