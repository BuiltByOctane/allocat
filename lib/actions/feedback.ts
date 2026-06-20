"use server";

import { createClient } from "@/lib/supabase/server";

export type FeedbackKind = "bug" | "feature" | "feedback";

export interface SubmitFeedbackInput {
  kind: FeedbackKind;
  message: string;
  appVersion?: string | null;
  platform?: string | null;
}

/**
 * Inserts an in-app feedback / bug-report / feature-request row for the signed-in
 * user. Online-only (called directly, not through the offline sync queue) — the
 * caller surfaces a friendly error on failure.
 */
export async function submitFeedback(
  input: SubmitFeedbackInput,
): Promise<{ success: true } | { error: string }> {
  const message = input.message?.trim();
  if (!message) {
    return { error: "Please enter a message." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return { error: "You need to be signed in to send feedback." };
  }

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    kind: input.kind,
    message: message.slice(0, 2000),
    app_version: input.appVersion ?? null,
    platform: input.platform ?? null,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
