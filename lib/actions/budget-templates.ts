"use server";

import { createClient } from "@/lib/supabase/server";
import type { BudgetTemplate, TemplateCategory } from "@/lib/budget-templates";

/** Shape accepted when saving a custom template (id/savedAt assigned by DB). */
export type SaveTemplateInput = Pick<
  BudgetTemplate,
  "name" | "description" | "preview" | "categories"
>;

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

/** Persist a new custom template; returns the saved row. */
export async function saveBudgetTemplate(
  input: SaveTemplateInput
): Promise<BudgetTemplate> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const name = input.name.trim();
  if (!name) throw new Error("Template name is required");

  const { data, error } = await supabase
    .from("budget_templates")
    .insert({
      user_id: user.id,
      name,
      description: input.description?.trim() || null,
      preview: input.preview ?? [],
      categories: input.categories as never,
    })
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
