import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAssetCategories,
  addAssetCategory,
  updateAssetCategory,
  deleteAssetCategory,
} from "@/lib/actions/asset-categories";
import { getDB } from "@/lib/db";
import { useEnqueue } from "@/lib/hooks/useSync";

export const ASSET_CATEGORIES_KEY = ["asset-categories"] as const;

async function getCategoriesFromIDB() {
  const db = getDB();
  const cats = await db.asset_categories.orderBy("created_at").toArray();
  if (cats.length === 0) return null;
  return cats;
}

export function useAssetCategories() {
  return useQuery({
    queryKey: ASSET_CATEGORIES_KEY,
    queryFn: async () => {
      const local = await getCategoriesFromIDB();
      if (local) return local;
      return getAssetCategories();
    },
  });
}

export function useAddAssetCategory() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({ name, icon }: { name: string; icon: string }) => {
      const db = getDB();
      const tempId = `temp_${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      await db.asset_categories.add({
        id: tempId,
        user_id: "__pending__",
        name,
        icon,
        color: null,
        created_at: now,
      });

      await enqueue({
        table: "asset_categories",
        operation: "INSERT",
        recordId: tempId,
        tempId,
        payload: { name, icon },
      });

      return { id: tempId, name, icon, created_at: now };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ASSET_CATEGORIES_KEY });
    },
  });
}

export function useUpdateAssetCategory() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { name?: string; icon?: string } }) => {
      const db = getDB();
      await db.asset_categories.update(id, updates);
      await enqueue({
        table: "asset_categories",
        operation: "UPDATE",
        recordId: id,
        payload: { id, updates },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ASSET_CATEGORIES_KEY });
    },
  });
}

export function useDeleteAssetCategory() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async (id: string) => {
      const db = getDB();
      await db.asset_categories.delete(id);
      await enqueue({
        table: "asset_categories",
        operation: "DELETE",
        recordId: id,
        payload: { id },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ASSET_CATEGORIES_KEY });
    },
  });
}
