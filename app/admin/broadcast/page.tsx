import { requireAdmin } from "@/lib/admin/guard";
import { listCampaigns } from "@/lib/admin/queries";
import { BroadcastForm } from "@/components/admin/BroadcastForm";
import { ago, num } from "@/lib/admin/format";

export default async function AdminBroadcastPage() {
  await requireAdmin();
  const campaigns = await listCampaigns();

  return (
    <div className="flex flex-col gap-5">
      <BroadcastForm />

      <section>
        <h2 className="t-label text-muted-foreground mb-2.5">Past campaigns</h2>
        {campaigns.length === 0 ? (
          <p className="t-body-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <div className="rounded-card bg-card divide-y divide-border">
            {campaigns.map((c) => (
              <div key={c.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="t-body-sm font-semibold">{c.title}</span>
                  <span className="t-body-sm text-muted-foreground font-mono">
                    {num(c.sent_count)} sent · {num(c.failed_count)} failed · {c.segment} · {ago(c.created_at)}
                  </span>
                </div>
                <p className="t-body-sm text-muted-foreground">{c.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
