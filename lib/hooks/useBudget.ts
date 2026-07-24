import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBudgetView, ensureBudgetRow } from "@/lib/actions/budget";
import {
  getBudgetTemplates,
  saveBudgetTemplate,
  type SaveTemplateInput,
} from "@/lib/actions/budget-templates";
import { PREDEFINED_TEMPLATES, type BudgetTemplate } from "@/lib/budget-templates";
import { computeTemplateDrift, type DriftCategory } from "@/lib/budget/templateDrift";
import { fitItemsToAllocation, type SetupCategory } from "@/lib/budget/setupMath";
import { reapplyRulesToPending } from "@/lib/sms/ingestClient";
import { pushSmsMirrorToNative } from "@/lib/sms/nativeMirror";
import { getDB } from "@/lib/db";
import { useEnqueue } from "@/lib/hooks/useSync";
import { computeAutoCompletion } from "@/lib/utils/budget-completion";
import { applyLinkedSpendCascadeIDB } from "@/lib/utils/budget-cascade";
import { DASHBOARD_KEY } from "./useDashboard";
import { NET_WORTH_KEY } from "./useNetWorth";
import { GOALS_KEY } from "./useGoals";
import { DEBT_KEY } from "./useDebt";

type LinkType = "asset" | "debt";

export function budgetKey(month: number, year: number) {
  return ["budget", month, year] as const;
}

// Shared cache for the user's custom templates (the setup sheet also fetches
// these ad-hoc; this key lets the budget header + sheet reconcile after edits).
export const TEMPLATES_KEY = ["budgetTemplates"] as const;

export function useBudgetTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: getBudgetTemplates,
    staleTime: 5 * 60_000,
  });
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

  // Single bulk read of every item across all categories instead of one query
  // per category (N+1), then group in memory — matches the useDashboard pattern.
  const categoryIds = categories.map((c) => c.id);
  const allItems = categoryIds.length
    ? await db.budget_items.where("category_id").anyOf(categoryIds).toArray()
    : [];
  const itemsByCategory = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const arr = itemsByCategory.get(item.category_id);
    if (arr) arr.push(item);
    else itemsByCategory.set(item.category_id, [item]);
  }

  const enrichedCategories = categories.map((cat) => {
    const items = itemsByCategory.get(cat.id) ?? [];
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
  });

  return {
    id: budget.id,
    month: budget.month,
    year: budget.year,
    totalBudget: Number(budget.total_budget),
    templateId: budget.template_id ?? null,
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

      // IDB miss: read-only server fetch (never creates a row). When no budget
      // exists yet, hand back a virtual empty budget (id "") so the page shows
      // its empty state; a real row is created lazily on the first write action.
      const view = await getBudgetView(month, year);
      if (view) return view;
      return { id: "", month, year, totalBudget: 0, templateId: null, categories: [] };
    },
  });
}

// ─── Template header resolution ───────────────────────────────────────────────

/** Project the current budget's IDB rows down to what drift detection needs. */
async function getBudgetDriftItems(budgetId: string): Promise<DriftCategory[]> {
  const db = getDB();
  const cats = await db.categories.where("budget_id").equals(budgetId).toArray();
  // Bulk-read all items once (not per category), then group in memory.
  const catIds = cats.map((c) => c.id);
  const allItems = catIds.length
    ? await db.budget_items.where("category_id").anyOf(catIds).toArray()
    : [];
  const itemsByCategory = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const arr = itemsByCategory.get(item.category_id);
    if (arr) arr.push(item);
    else itemsByCategory.set(item.category_id, [item]);
  }
  return cats.map((cat) => ({
    name: cat.name,
    items: (itemsByCategory.get(cat.id) ?? []).map((it) => ({
      name: it.name,
      template_item_id: it.template_item_id ?? null,
    })),
  }));
}

export interface BudgetTemplateHeader {
  template: BudgetTemplate | null;
  isPredefined: boolean;
  isCustom: boolean;
  /** Linked to a custom template that no longer exists (deleted elsewhere). */
  isDeleted: boolean;
  linked: boolean;
  drifted: boolean;
  isLoading: boolean;
}

/**
 * Resolve a budget's linked template (predefined or custom) and whether the
 * budget has structurally drifted from it. Drives the state-aware template
 * control on the budget listing header. The drift read is gated to linked
 * budgets so the hot budgetKey query stays lean.
 */
export function useBudgetTemplateHeader({
  budgetId,
  templateId,
}: {
  budgetId: string;
  templateId: string | null;
}): BudgetTemplateHeader {
  const templatesQuery = useBudgetTemplates();

  const predefined = templateId
    ? PREDEFINED_TEMPLATES.find((t) => t.id === templateId) ?? null
    : null;
  const customMatch =
    templateId && templatesQuery.data
      ? templatesQuery.data.find((t) => t.id === templateId) ?? null
      : null;
  const template: BudgetTemplate | null = predefined ?? customMatch;

  const driftQuery = useQuery({
    queryKey: ["budgetDriftItems", budgetId],
    queryFn: () => getBudgetDriftItems(budgetId),
    enabled: !!templateId && !!budgetId,
  });

  const { linked, drifted } = computeTemplateDrift(
    driftQuery.data ?? [],
    template
  );

  const isLoading =
    templatesQuery.isLoading ||
    (!!templateId && !!budgetId && driftQuery.isLoading);

  return {
    template,
    isPredefined: !!predefined,
    isCustom: !!customMatch,
    isDeleted:
      !!templateId && !predefined && !customMatch && !templatesQuery.isLoading,
    linked,
    drifted,
    isLoading,
  };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Resolve a real-or-temp budget row id for a period before the first write.
 * Online: create-or-get on the server (fast path, real id immediately).
 * Offline: mint a temp_ IDB row + enqueue a plain budgets INSERT — the standard
 * id_map dependency chain resolves every later payload referencing the temp id.
 */
export function useEnsureBudgetRow() {
  const enqueue = useEnqueue();

  return async function ensureRow(month: number, year: number): Promise<string> {
    const db = getDB();
    const existing = await db.budgets
      .where("[month+year]")
      .equals([month, year])
      .first();
    if (existing) return existing.id;

    try {
      const row = await ensureBudgetRow(month, year);
      await db.budgets.put(row);
      return row.id;
    } catch {
      // Offline (or the action failed): create locally and queue the INSERT.
      const tempId = `temp_${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      await db.budgets.add({
        id: tempId,
        user_id: "__pending__",
        month,
        year,
        total_budget: 0,
        is_locked: false,
        template_id: null,
        created_at: now,
        updated_at: now,
      });
      await enqueue({
        table: "budgets",
        operation: "INSERT",
        recordId: tempId,
        tempId,
        payload: { month, year },
      });
      return tempId;
    }
  };
}

export interface SetupBudgetInput {
  budgetId: string;
  month: number;
  year: number;
  totalBudget: number;
  /** Template the budget anchors to (durable SMS identity). Null = manual. */
  templateId: string | null;
  categories: SetupCategory[];
  /** When set, also persist the categories as a custom template under this id. */
  saveAsTemplate: { id: string; payload: SaveTemplateInput } | null;
}

/**
 * Create a month's budget in one shot: optimistic IDB rows + a single
 * BULK_SETUP enqueue (extracted from the legacy BudgetSetupSheet create mode so
 * BudgetQuickSetup and any future setup surface share one pipeline). Item
 * planned amounts are fitted inside each category allocation so the server's
 * allocation invariants can never reject the batch.
 */
export function useSetupBudget() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async (input: SetupBudgetInput) => {
      const db = getDB();
      const now = new Date().toISOString();
      const { budgetId, totalBudget, templateId } = input;

      if (totalBudget > 0) {
        await db.budgets.update(budgetId, {
          total_budget: totalBudget,
          template_id: templateId,
          updated_at: now,
        });
      } else {
        await db.budgets.update(budgetId, { template_id: templateId });
      }

      const bulkCategories: Array<{
        tempId: string;
        name: string;
        icon: string | null;
        type: "misc";
        allocated_amount: number;
        items: Array<{
          tempId: string;
          name: string;
          planned: number;
          linkType: LinkType | null;
          linkId: string | null;
          templateItemId: string | null;
        }>;
      }> = [];

      for (const cat of input.categories) {
        const catName = cat.name.trim();
        if (!catName) continue;

        const catTempId = `temp_${crypto.randomUUID()}`;
        await db.categories.add({
          id: catTempId,
          budget_id: budgetId,
          user_id: "__pending__",
          name: catName,
          color: null,
          icon: cat.icon,
          type: "misc",
          allocated_amount: cat.allocation,
          created_at: now,
          updated_at: now,
        });

        const namedItems = cat.items.filter((i) => i.name.trim());
        const fitted = fitItemsToAllocation(
          namedItems.map((i) => ({ planned: Math.max(0, i.allocation) })),
          cat.allocation
        );

        const itemPayloads: (typeof bulkCategories)[number]["items"] = [];
        for (let idx = 0; idx < namedItems.length; idx++) {
          const item = namedItems[idx];
          const itemTempId = `temp_${crypto.randomUUID()}`;
          const planned = fitted[idx];
          const linkType = item.linkType ?? null;
          const linkId = item.linkId ?? null;
          const templateItemId = templateId
            ? item.templateItemId ?? item.id
            : null;
          await db.budget_items.add({
            id: itemTempId,
            category_id: catTempId,
            user_id: "__pending__",
            name: item.name.trim(),
            emoji: null,
            planned_amount: planned,
            actual_amount: 0,
            is_completed: false,
            notes: null,
            link_type: linkType,
            link_id: linkId,
            template_id: templateItemId ? templateId : null,
            template_item_id: templateItemId,
            overspend_count: 0,
            created_at: now,
            updated_at: now,
          });
          itemPayloads.push({
            tempId: itemTempId,
            name: item.name.trim(),
            planned,
            linkType,
            linkId,
            templateItemId,
          });
        }

        bulkCategories.push({
          tempId: catTempId,
          name: catName,
          icon: cat.icon,
          type: "misc",
          allocated_amount: cat.allocation,
          items: itemPayloads,
        });
      }

      if (bulkCategories.length > 0 || totalBudget > 0) {
        await enqueue({
          table: "budgets",
          operation: "BULK_SETUP",
          recordId: budgetId,
          payload: {
            budgetId,
            totalBudget,
            templateId,
            categories: bulkCategories,
          },
        });
      }

      // Persist the custom template under the SAME id the budget anchors to, so
      // reusing it next month re-stamps the same durable identity.
      if (input.saveAsTemplate) {
        await saveBudgetTemplate(
          input.saveAsTemplate.payload,
          input.saveAsTemplate.id
        );
      }

      // This month's items now exist with durable ids — SMS that landed pending
      // before the budget existed can auto-allocate. Best-effort.
      if (templateId) {
        try {
          await reapplyRulesToPending({ enqueue });
        } catch {
          /* best-effort */
        }
      }
      try {
        await pushSmsMirrorToNative();
      } catch {
        /* best-effort */
      }
    },
    onSuccess: (_data, { month, year, budgetId }) => {
      qc.invalidateQueries({ queryKey: budgetKey(month, year) });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
      qc.invalidateQueries({ queryKey: ["budgetDriftItems", budgetId] });
    },
  });
}

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
      const trimmedName = name.trim();

      // Optimistically write to IDB
      await db.categories.add({
        id: tempId,
        budget_id: budgetId,
        user_id: "__pending__",
        name: trimmedName,
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
        payload: { budgetId, name: trimmedName, type },
      });

      // No item seeding — the category starts empty. A generic starter item
      // ("Item 1", holding the whole allocation) is seeded on the category's
      // detail page the first time it's opened, so seeding is uniform across
      // every "new category" surface and "blank" truly means blank here.

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
        // Added directly to a budget (not from a template item) → no durable id.
        template_id: null,
        template_item_id: null,
        overspend_count: 0,
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
      // Done is derived from spend: recompute whenever spend or allocation moves.
      if (
        (updates.actual_amount !== undefined || updates.planned_amount !== undefined) &&
        updates.is_completed === undefined &&
        existing
      ) {
        const planned =
          updates.planned_amount !== undefined
            ? Number(updates.planned_amount)
            : Number(existing.planned_amount);
        const actual =
          updates.actual_amount !== undefined
            ? Number(updates.actual_amount)
            : Number(existing.actual_amount);
        finalUpdates.is_completed = computeAutoCompletion(planned, actual);
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
