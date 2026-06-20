"use server";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database";

export interface UpsertReportInput {
  budgetId: string;
  month: number;
  year: number;
  notes: string;
  summaryData?: Json;
}

/**
 * Create or update the monthly report for the current user. A report is unique
 * per (user_id, month, year); saving notes again upserts the same row.
 */
export async function upsertReport(input: UpsertReportInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { budgetId, month, year, notes, summaryData } = input;

  const { data, error } = await supabase
    .from("reports")
    .upsert(
      {
        budget_id: budgetId,
        user_id: user.id,
        month,
        year,
        notes,
        ...(summaryData !== undefined ? { summary_data: summaryData } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,month,year" },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Read the monthly report for the current user (null if none saved yet). */
export async function getReport(month: number, year: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("user_id", user.id)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}
