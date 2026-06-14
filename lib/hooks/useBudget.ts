import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBudgetForPeriod } from "@/lib/actions/budget";
import { getDB } from "@/lib/db";
import { useEnqueue } from "@/lib/hooks/useSync";
import {
  computeAutoCompletion,
  actualOnManualComplete,
} from "@/lib/utils/budget-completion";
import { applyLinkedSpendCascadeIDB } from "@/lib/utils/budget-cascade";
import { DASHBOARD_KEY } from "./useDashboard";
import { NET_WORTH_KEY } from "./useNetWorth";
import { GOALS_KEY } from "./useGoals";
import { DEBT_KEY } from "./useDebt";

type LinkType = "asset" | "debt";

export function budgetKey(month: number, year: number) {
  return ["budget", month, year] as const;
}

// ─── IDB read helper ──────────────────────────────────────────────────────────

export async function getBudgetFromIDB(month: number, year: number) {
  const db = getDB();

  const budget = await db.budgets
    .where("[month+year]")
    .equals([month, year])
    .first();

  if (!budget) return null;

  const categories = await db.categories
    .where("budget_id")
    .equals(budget.id)
    .toArray();

  const enrichedCategories = await Promise.all(
    categories.map(async (cat) => {
      const items = await db.budget_items
        .where("category_id")
        .equals(cat.id)
        .toArray();

      const spent = items.reduce((s, i) => s + Number(i.actual_amount), 0);

      return {
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        type: cat.type,
        allocated: Number(cat.allocated_amount),
        spent,
        subtitle: `${items.length} items`,
      };
    })
  );

  return {
    id: budget.id,
    month: budget.month,
    year: budget.year,
    totalBudget: Number(budget.total_budget),
    categories: enrichedCategories,
  };
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function useBudgetData(month: number, year: number) {
  return useQuery({
    queryKey: budgetKey(month, year),
    queryFn: async () => {
      // Serve from IDB first — instant, works offline
      const local = await getBudgetFromIDB(month, year);
      if (local) return local;

      // IDB miss: first-ever open or a new month — fall back to server
      // (server creates the budget row for new months)
      return getBudgetForPeriod(month, year);
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useUpdateBudgetTotal() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      budgetId,
      totalAmount,
    }: {
      budgetId: string;
      totalAmount: number;
      month: number;
      year: number;
    }) => {
      const db = getDB();
      const now = new Date().toISOString();
      await db.budgets.update(budgetId, {
        total_budget: totalAmount,
        updated_at: now,
      });
      await enqueue({
        table: "budgets",
        operation: "UPDATE",
        recordId: budgetId,
        payload: { budgetId, totalAmount },
      });
    },
    onSuccess: (_data, { month, year }) => {
      qc.invalidateQueries({ queryKey: budgetKey(month, year) });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
      // The category detail screen shows total budget (for over-allocation math).
      qc.invalidateQueries({ queryKey: ["categoryData"] });
    },
  });
}

export function useAddBudgetCategory() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      budgetId,
      name,
      type = "misc",
    }: {
      budgetId: string;
      name: string;
      type?: "needs" | "wants" | "investments" | "misc";
      month: number;
      year: number;
    }) => {
      const db = getDB();
      const tempId = `temp_${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      // Optimistically write to IDB
      await db.categories.add({
        id: tempId,
        budget_id: budgetId,
        user_id: "__pending__",
        name: name.trim(),
        icon: null,
        color: null,
        type,
        allocated_amount: 0,
        created_at: now,
        updated_at: now,
      });

      await enqueue({
        table: "categories",
        operation: "INSERT",
        recordId: tempId,
        tempId,
        payload: { budgetId, name: name.trim(), type },
      });

      return { id: tempId };
    },
    onSuccess: (_data, { month, year }) => {
      qc.invalidateQueries({ queryKey: budgetKey(month, year) });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
      // A new category changes "otherAllocated" on every category detail screen.
      qc.invalidateQueries({ queryKey: ["categoryData"] });
    },
  });
}

export function useUpdateCategoryAllocation() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      categoryId,
      allocatedAmount,
    }: {
      categoryId: string;
      allocatedAmount: number;
      month: number;
      year: number;
    }) => {
      const db = getDB();
      await db.categories.update(categoryId, {
        allocated_amount: allocatedAmount,
        updated_at: new Date().toISOString(),
      });
      await enqueue({
        table: "categories",
        operation: "UPDATE",
        recordId: categoryId,
        payload: { categoryId, updates: { allocated_amount: allocatedAmount } },
      });
    },
    onSuccess: (_data, { month, year }) => {
      qc.invalidateQueries({ queryKey: budgetKey(month, year) });
      // The category detail screen reads the allocation too.
      qc.invalidateQueries({ queryKey: ["categoryData"] });
    },
  });
}

export function useUpdateCategoryIcon() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      categoryId,
      icon,
    }: {
      categoryId: string;
      icon: string;
      month: number;
      year: number;
    }) => {
      const db = getDB();
      await db.categories.update(categoryId, {
        icon,
        updated_at: new Date().toISOString(),
      });
      await enqueue({
        table: "categories",
        operation: "UPDATE",
        recordId: categoryId,
        payload: { categoryId, updates: { icon } },
      });
    },
    onSuccess: (_data, { month, year }) => {
      qc.invalidateQueries({ queryKey: budgetKey(month, year) });
      // The category detail screen reads the icon too.
      qc.invalidateQueries({ queryKey: ["categoryData"] });
    },
  });
}

export function useUpdateCategoryColor() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      categoryId,
      color,
    }: {
      categoryId: string;
      color: string | null;
      month: number;
      year: number;
    }) => {
      const db = getDB();
      await db.categories.update(categoryId, {
        color,
        updated_at: new Date().toISOString(),
      });
      await enqueue({
        table: "categories",
        operation: "UPDATE",
        recordId: categoryId,
        payload: { categoryId, updates: { color } },
      });
    },
    onSuccess: (_data, { month, year }) => {
      qc.invalidateQueries({ queryKey: budgetKey(month, year) });
      // The category detail screen reads the color too.
      qc.invalidateQueries({ queryKey: ["categoryData"] });
    },
  });
}

export function useAddBudgetItem() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      categoryId,
      name,
      planned = 0,
      link = null,
      emoji = null,
    }: {
      categoryId: string;
      name: string;
      planned?: number;
      link?: { link_type: LinkType; link_id: string } | null;
      emoji?: string | null;
      month: number;
      year: number;
    }) => {
      const db = getDB();
      const tempId = `temp_${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      await db.budget_items.add({
        id: tempId,
        category_id: categoryId,
        user_id: "__pending__",
        name: name.trim(),
        emoji: emoji ?? null,
        planned_amount: planned ?? 0,
        actual_amount: 0,
        is_completed: false,
        notes: null,
        link_type: link?.link_type ?? null,
        link_id: link?.link_id ?? null,
        created_at: now,
        updated_at: now,
      });

      await enqueue({
        table: "budget_items",
        operation: "INSERT",
        recordId: tempId,
        tempId,
        payload: { categoryId, name: name.trim(), planned: planned ?? 0, link, emoji: emoji ?? null },
      });

      return { id: tempId };
    },
    onSuccess: (_data, { month, year }) => {
      qc.invalidateQueries({ queryKey: budgetKey(month, year) });
      // A new item shows on the category detail screen + Quick-Spend dropdown.
      qc.invalidateQueries({ queryKey: ["categoryData"] });
      qc.invalidateQueries({ queryKey: ["categoryItems"] });
    },
  });
}

export function useUpdateBudgetItem() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      itemId,
      updates,
    }: {
      itemId: string;
      updates: {
        name?: string;
        emoji?: string | null;
        planned_amount?: number;
        actual_amount?: number;
        is_completed?: boolean;
        notes?: string | null;
        link_type?: LinkType | null;
        link_id?: string | null;
      };
      month: number;
      year: number;
    }) => {
      const db = getDB();
      const existing = await db.budget_items.get(itemId);
      const finalUpdates = { ...updates };
      if (
        updates.actual_amount !== undefined &&
        updates.is_completed === undefined &&
        existing
      ) {
        const planned =
          updates.planned_amount !== undefined
            ? Number(updates.planned_amount)
            : Number(existing.planned_amount);
        finalUpdates.is_completed = computeAutoCompletion(
          planned,
          Number(updates.actual_amount),
          Boolean(existing.is_completed)
        );
      }

      // Marking an item complete treats the full planned allocation as used:
      // bump actual up to planned (overspends are kept). Only on the
      // false→true transition, and respects an explicit actual in the same save.
      if (updates.is_completed === true && existing && !existing.is_completed) {
        const planned =
          updates.planned_amount !== undefined
            ? Number(updates.planned_amount)
            : Number(existing.planned_amount);
        const curActual =
          updates.actual_amount !== undefined
            ? Number(updates.actual_amount)
            : Number(existing.actual_amount);
        finalUpdates.actual_amount = actualOnManualComplete(planned, curActual);
      }

      // Cascade off finalUpdates so a completion-driven actual bump still
      // flows to linked asset/debt/goal rows.
      const cascade = existing
        ? await applyLinkedSpendCascadeIDB(existing, finalUpdates)
        : { touchedNetWorth: false, touchedGoals: false, touchedDebt: false };

      await db.budget_items.update(itemId, {
        ...finalUpdates,
        updated_at: new Date().toISOString(),
      });
      await enqueue({
        table: "budget_items",
        operation: "UPDATE",
        recordId: itemId,
        payload: { itemId, updates: finalUpdates },
      });

      return cascade;
    },
    onSuccess: async (_result, { month, year, updates }) => {
      qc.invalidateQueries({ queryKey: budgetKey(month, year) });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
      // The category detail screen + Quick-Spend dropdown read this item too.
      qc.invalidateQueries({ queryKey: ["categoryData"] });
      qc.invalidateQueries({ queryKey: ["categoryItems"] });
      // Force refetch unconditionally on actual_amount changes so cross-section
      // caches reflect the cascade — covers legacy IDB rows where link_type
      // hadn't been rewritten yet.
      if (updates.actual_amount !== undefined || updates.is_completed === true) {
        await qc.refetchQueries({ queryKey: NET_WORTH_KEY, type: "all" });
        await qc.refetchQueries({ queryKey: GOALS_KEY, type: "all" });
        await qc.refetchQueries({ queryKey: DEBT_KEY, type: "all" });
        await qc.refetchQueries({ queryKey: ["asset-history"], type: "all" });
      }
    },
  });
}

export function useDeleteBudgetItem() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      itemId,
    }: {
      itemId: string;
      month: number;
      year: number;
    }) => {
      const db = getDB();
      await db.budget_items.delete(itemId);
      await enqueue({
        table: "budget_items",
        operation: "DELETE",
        recordId: itemId,
        payload: { itemId },
      });
    },
    onSuccess: (_data, { month, year }) => {
      qc.invalidateQueries({ queryKey: budgetKey(month, year) });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
      // A deleted item must also drop off the category detail screen + dropdown.
      qc.invalidateQueries({ queryKey: ["categoryData"] });
      qc.invalidateQueries({ queryKey: ["categoryItems"] });
    },
  });
}
