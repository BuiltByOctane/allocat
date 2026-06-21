"use server";

import { createClient } from "@/lib/supabase/server";
import type { BudgetTemplate, TemplateCategory } from "@/lib/budget-templates";

/** Shape accepted when saving a custom template (savedAt assigned by DB). */
export type SaveTemplateInput = Pick<
  BudgetTemplate,
  "name" | "description" | "preview" | "categories"
>;

/**
 * Guarantee every template item carries a durable `templateItemId`. Items that
 * already have one keep it (preserving SMS allocations across edits/renames);
 * brand-new items get a fresh uuid. Defensive: the client normally supplies ids,
 * but never trust the payload. See lib/sms/resolveRuleItem.ts.
 */
function ensureTemplateItemIds(
  categories: TemplateCategory[]
): TemplateCategory[] {
  return (categories ?? []).map((c) => ({
    ...c,
    items: (c.items ?? []).map((i) => ({
      ...i,
      templateItemId: i.templateItemId?.trim() || crypto.randomUUID(),
    })),
  }));
}

/** Map a DB row into the client-facing BudgetTemplate. */
function rowToTemplate(row: {
  id: string;
  name: string;
  description: string | null;
  preview: string[];
  categories: unknown;
  created_at: string;
}): BudgetTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    preview: row.preview ?? [],
    categories: (row.categories as TemplateCategory[]) ?? [],
    isCustom: true,
    savedAt: row.created_at,
  };
}

/** All custom templates for the current user, newest first. */
export async function getBudgetTemplates(): Promise<BudgetTemplate[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("budget_templates")
    .select("id, name, description, preview, categories, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToTemplate);
}

/**
 * Persist a new custom template; returns the saved row. An optional `id` lets a
 * budget being created share the same template id, so reusing the template next
 * month re-stamps the same identity onto its items (cross-month SMS rules).
 */
export async function saveBudgetTemplate(
  input: SaveTemplateInput,
  id?: string | null
): Promise<BudgetTemplate> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const name = input.name.trim();
  if (!name) throw new Error("Template name is required");

  const { data, error } = await supabase
    .from("budget_templates")
    .insert({
      ...(id ? { id } : {}),
      user_id: user.id,
      name,
      description: input.description?.trim() || null,
      preview: input.preview ?? [],
      categories: ensureTemplateItemIds(input.categories) as never,
    })
    .select("id, name, description, preview, categories, created_at")
    .single();

  if (error) throw new Error(error.message);
  return rowToTemplate(data);
}

/** Update an existing custom template in place; returns the saved row. */
export async function updateBudgetTemplate(
  id: string,
  input: SaveTemplateInput
): Promise<BudgetTemplate> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const name = input.name.trim();
  if (!name) throw new Error("Template name is required");

  const { data, error } = await supabase
    .from("budget_templates")
    .update({
      name,
      description: input.description?.trim() || null,
      preview: input.preview ?? [],
      // Preserve existing item ids (rename keeps allocations); mint only for new.
      categories: ensureTemplateItemIds(input.categories) as never,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, description, preview, categories, created_at")
    .single();

  if (error) throw new Error(error.message);
  return rowToTemplate(data);
}

/** Delete a custom template by id (RLS scopes to the owner). */
export async function deleteBudgetTemplate(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("budget_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}
