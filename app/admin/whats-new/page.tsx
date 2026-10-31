import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceClient } from "@/lib/supabase/service";
import { countRecipients } from "@/lib/server/push-broadcast";
import { normalizeTags } from "@/lib/whats-new/format";
import type { WhatsNewEntry } from "@/lib/whats-new/types";
import { WhatsNewEditor } from "@/components/admin/WhatsNewEditor";
import { WhatsNewRow } from "@/components/admin/WhatsNewRow";

export default async function AdminWhatsNewPage() {
  await requireAdmin();
  // `whats_new_entries` is not in the generated Database types; use an untyped client.
  const service = createServiceClient() as unknown as SupabaseClient;
  const [{ data, error }, reach] = await Promise.all([
    service
      .from("whats_new_entries")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(100),
    // Advisory only; a counting failure must not take the page down.
    countRecipients("all").catch(() => ({ total: 0, web: 0, android: 0 })),
  ]);
  const entries: WhatsNewEntry[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as WhatsNewEntry),
    tags: normalizeTags(r.tags),
  }));

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-card bg-card p-5">
        <h2 className="t-label text-muted-foreground mb-3">New entry</h2>
        <WhatsNewEditor />
      </section>

      <section>
        <h2 className="t-label text-muted-foreground mb-2.5">Entries</h2>
        {error ? (
          <p className="t-body-sm text-neg">✕ {error.message}</p>
        ) : entries.length === 0 ? (
          <p className="t-body-sm text-muted-foreground">Nothing published yet.</p>
        ) : (
          <div className="rounded-card bg-card divide-y divide-border">
            {entries.map((e) => (
              <WhatsNewRow key={e.id} entry={e} recipients={reach.total} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
