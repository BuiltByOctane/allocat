"use server";

import { createClient, getAuthedUser } from "@/lib/supabase/server";
import { normalizeTags } from "@/lib/whats-new/format";
import type { WhatsNewEntry } from "@/lib/whats-new/types";

export async function getWhatsNewEntries(): Promise<WhatsNewEntry[]> {
  const user = await getAuthedUser();
  if (!user) throw new Error("Unauthorized");
  const supabase = await createClient();

  // Table is not in the generated Database types yet; cast the client.
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        order: (
          c: string,
          o: { ascending: boolean },
        ) => {
          limit: (n: number) => Promise<{
            data: Record<string, unknown>[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from("whats_new_entries")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    ...(r as unknown as WhatsNewEntry),
    tags: normalizeTags(r.tags),
  }));
}
