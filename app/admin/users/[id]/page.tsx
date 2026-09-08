import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { getUserDetail } from "@/lib/admin/queries";
import { UserActions } from "@/components/admin/UserActions";
import { Tile } from "@/components/admin/Tile";
import { num, ago, date } from "@/lib/admin/format";

interface ProfileShape {
  id: string;
  email: string;
  full_name: string;
  currency: string;
  is_onboarded: boolean;
  is_supporter: boolean;
  last_app_mode: string | null;
  created_at: string;
  last_seen_at: string | null;
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getUserDetail(id);
  const profile = detail.profile as unknown as ProfileShape | null;
  if (!profile) notFound();

  const aiTotal = detail.ai_usage_7d.reduce((a, b) => a + b.count, 0);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/users" className="t-body-sm text-muted-foreground hover:text-foreground w-fit">
        ← All users
      </Link>

      <div className="rounded-card bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="t-title">{profile.full_name || "—"}</h2>
            <p className="t-body-sm text-muted-foreground font-mono">{profile.email}</p>
            <p className="t-body-sm text-muted-foreground font-mono">{profile.id}</p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {profile.is_supporter && (
              <span className="rounded-pill bg-accent text-[var(--accent-ink)] px-2.5 py-1 t-micro">supporter</span>
            )}
            <span className="rounded-pill bg-tile text-muted-foreground px-2.5 py-1 t-micro">
              {profile.last_app_mode ?? "web"}
            </span>
            <span className="rounded-pill bg-tile text-muted-foreground px-2.5 py-1 t-micro">{profile.currency}</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 t-body-sm">
          <div>
            <span className="text-muted-foreground">Joined </span>
            <span className="font-mono">{date(profile.created_at)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Last seen </span>
            {ago(profile.last_seen_at)}
          </div>
          <div>
            <span className="text-muted-foreground">Onboarded </span>
            {profile.is_onboarded ? "yes" : "no"}
          </div>
          <div>
            <span className="text-muted-foreground">AI · 7d </span>
            <span className="font-mono">{num(aiTotal)}</span>
          </div>
        </div>
      </div>

      <section>
        <h3 className="t-label text-muted-foreground mb-2.5">Data</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {Object.entries(detail.counts).map(([k, v]) => (
            <Tile key={k} label={k.replace(/_/g, " ")} value={num(v)} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="t-label text-muted-foreground mb-2.5">Actions</h3>
        <div className="rounded-card bg-card p-5">
          <UserActions userId={profile.id} email={profile.email} isSupporter={profile.is_supporter} />
        </div>
      </section>

      {detail.feedback.length > 0 && (
        <section>
          <h3 className="t-label text-muted-foreground mb-2.5">Feedback from this user</h3>
          <div className="flex flex-col gap-2">
            {detail.feedback.map((f) => (
              <div key={f.id} className="rounded-tile bg-card p-3.5">
                <div className="flex justify-between gap-3 t-body-sm text-muted-foreground">
                  <span className="font-semibold uppercase">{f.kind}</span>
                  <span className="font-mono">{date(f.created_at)}</span>
                </div>
                <p className="t-body-sm mt-1 whitespace-pre-wrap">{f.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="t-label text-muted-foreground mb-2.5">Recent activity</h3>
        {detail.recent_activity.length === 0 ? (
          <p className="t-body-sm text-muted-foreground">No logged activity.</p>
        ) : (
          <div className="rounded-card bg-card divide-y divide-border">
            {detail.recent_activity.map((a, i) => (
              <div key={`${a.created_at}-${i}`} className="flex justify-between gap-4 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="t-body-sm font-semibold truncate">{a.title}</div>
                  <div className="t-body-sm text-muted-foreground font-mono">{a.action_type}</div>
                </div>
                <div className="t-body-sm text-muted-foreground whitespace-nowrap">{ago(a.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
