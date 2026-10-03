"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDB } from "@/lib/db";
import type {
  AllocatePickerItem,
  AllocateCategory,
} from "@/components/sms/AllocateSheet";
import type { LinkTarget } from "@/components/budget/ItemDetailSheet";

/**
 * Shared by the SMS allocate sheet and the manual spend sheet. The literal is
 * also invalidated from useSmsTransactions — keep them in step.
 */
export const ALLOCATE_PICKER_KEY = ["sms-picker"] as const;

export type CategoryType = "needs" | "wants" | "investments" | "misc" | null;

export interface CatMeta {
  name: string;
  icon: string | null;
  type: CategoryType;
  allocation: number;
  /** Σ planned of the category's existing items (the "other items" for a new one). */
  plannedTotal: number;
}

export interface PickerData {
  items: AllocatePickerItem[];
  categories: AllocateCategory[];
  metaById: Record<string, CatMeta>;
}

/** Budget items + categories for the current month, read from IDB. */
export async function loadPickerData(): Promise<PickerData> {
  const db = getDB();
  const now = new Date();
  const budget = await db.budgets
    .where("[month+year]")
    .equals([now.getMonth() + 1, now.getFullYear()])
    .first();
  if (!budget) return { items: [], categories: [], metaById: {} };

  const categories = await db.categories
    .where("budget_id")
    .equals(budget.id)
    .toArray();

  const items: AllocatePickerItem[] = [];
  const metaById: Record<string, CatMeta> = {};

  for (const cat of categories) {
    const catItems = await db.budget_items
      .where("category_id")
      .equals(cat.id)
      .toArray();
    for (const item of catItems) {
      items.push({
        id: item.id,
        itemName: item.name,
        categoryName: cat.name,
        icon: cat.icon,
        emoji: item.emoji ?? null,
        planned: Number(item.planned_amount) || 0,
        actual: Number(item.actual_amount) || 0,
      });
    }
    metaById[cat.id] = {
      name: cat.name,
      icon: cat.icon,
      type: (cat.type as CategoryType) ?? null,
      allocation: Number(cat.allocated_amount) || 0,
      plannedTotal: catItems.reduce((s, i) => s + (Number(i.planned_amount) || 0), 0),
    };
  }

  return {
    items,
    categories: categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
    metaById,
  };
}

/** Current-month items + categories for an allocate-style picker. */
export function useAllocatePicker(enabled = true) {
  return useQuery({
    queryKey: ALLOCATE_PICKER_KEY,
    queryFn: loadPickerData,
    enabled,
    // The app default is staleTime: Infinity, but items are added from other
    // screens that don't invalidate this key. It's a cheap IDB read, so re-read
    // whenever a sheet opens (enabled flips) or the page mounts.
    staleTime: 0,
  });
}

/** Asset/debt link targets for the full item editor (loaded once per mount). */
export function useLinkTargets(): { assets: LinkTarget[]; debts: LinkTarget[] } {
  const [linkTargets, setLinkTargets] = useState<{
    assets: LinkTarget[];
    debts: LinkTarget[];
  }>({ assets: [], debts: [] });

  useEffect(() => {
    const db = getDB();
    let cancelled = false;
    (async () => {
      const [assets, debts] = await Promise.all([
        db.assets.toArray(),
        db.debts.toArray(),
      ]);
      if (cancelled) return;
      const activeAssets = assets.filter((a) => !a.achieved_at);
      setLinkTargets({
        assets: activeAssets.map((a) => ({
          id: a.id,
          name: a.is_goal ? `🎯 ${a.name}` : a.name,
          icon: a.icon,
        })),
        debts: debts.map((d) => ({ id: d.id, name: d.name, icon: d.icon })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return linkTargets;
}
