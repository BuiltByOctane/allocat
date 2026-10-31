"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceClient } from "@/lib/supabase/service";
import { broadcast } from "@/lib/server/push-broadcast";
import { whatsNewPushUrl } from "@/lib/whats-new/format";
import {
  bucketPathFromUrl,
  validateEntryInput,
  validateNotifyInput,
  type EntryInput,
} from "@/lib/admin/whatsNewInput";

/**
 * Admin write side of the "What's new" changelog. Every action re-runs
 * `requireAdmin()` — a server action is independently addressable.
 */

type Result<T extends object = object> = ({ ok: true } & T) | { error: string };

const BUCKET = "whats-new";
const PATH = "/admin/whats-new";

/** `whats_new_entries` is not in the generated Database types; use an untyped client. */
function db(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient;
}

export async function createWhatsNewEntry(input: EntryInput): Promise<Result<{ id: string }>> {
  await requireAdmin();
  const v = validateEntryInput(input);
  if (!v.ok) return { error: v.error };
  const { data, error } = await db()
    .from("whats_new_entries")
    .insert(v.value)
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { ok: true, id: (data as { id: string }).id };
}

/** Edits content only — `published_at` is never touched, so feed order and unseen state hold. */
export async function updateWhatsNewEntry(id: string, input: EntryInput): Promise<Result> {
  await requireAdmin();
  const v = validateEntryInput(input);
  if (!v.ok) return { error: v.error };
  const { title, body_md, tags, image_url } = v.value;
  const { error } = await db()
    .from("whats_new_entries")
    .update({ title, body_md, tags, image_url })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteWhatsNewEntry(id: string): Promise<Result> {
  await requireAdmin();
  const service = db();
  const { data, error } = await service
    .from("whats_new_entries")
    .delete()
    .eq("id", id)
    .select("image_url")
    .maybeSingle();
  if (error) return { error: error.message };
  const path = bucketPathFromUrl((data as { image_url: string | null } | null)?.image_url);
  if (path) {
    // Best effort: an orphaned image is harmless, a failed delete is not worth surfacing.
    const { error: rmErr } = await service.storage.from(BUCKET).remove([path]);
    if (rmErr) console.warn("[whats-new] image remove failed:", rmErr.message);
  }
  revalidatePath(PATH);
  return { ok: true };
}

export async function notifyWhatsNew(
  id: string,
  input: { title: string; body: string },
): Promise<Result<{ sent: number; recipients: number; warning?: string }>> {
  const admin = await requireAdmin();
  const v = validateNotifyInput(input);
  if (!v.ok) return { error: v.error };

  const service = db();
  const { data: entry, error: findErr } = await service
    .from("whats_new_entries")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (findErr) return { error: findErr.message };
  if (!entry) return { error: "Entry not found." };

  try {
    const res = await broadcast(
      "all",
      { title: v.value.title, body: v.value.body, url: whatsNewPushUrl(id), tag: "whats-new" },
      admin.id,
    );
    const { error } = await service
      .from("whats_new_entries")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", id);
    revalidatePath(PATH);
    if (error) {
      // The push already went out; report success but say the marker is stale.
      console.warn("[whats-new] notified_at stamp failed:", error.message);
      return {
        ok: true,
        sent: res.sent,
        recipients: res.recipients,
        warning: `Sent, but marking it notified failed (${error.message}) — it will still show "Not notified".`,
      };
    }
    return { ok: true, sent: res.sent, recipients: res.recipients };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Push failed" };
  }
}
