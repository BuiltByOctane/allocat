import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { searchUsers } from "@/lib/admin/queries";
import { ago, date } from "@/lib/admin/format";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const users = await searchUsers(q);

  return (
    <div className="flex flex-col gap-4">
      {/* Plain GET form — search needs no client JS and stays linkable/bookmarkable. */}
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Email, name or user id"
          className="flex-1 rounded-pill bg-card px-4 py-2.5 t-body-sm outline-none border border-border focus:border-foreground/40"
        />
        <button
          type="submit"
          className="rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] px-5 t-body-sm font-bold"
        >
          Search
        </button>
      </form>

      {users.length === 0 ? (
        <EmptyState icon="person_search" title="No users match" description={q ? `Nothing for “${q}”.` : undefined} />
      ) : (
        <div className="rounded-card bg-card overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="t-label-sm text-muted-foreground">
                <th className="px-4 py-3 font-bold">User</th>
                <th className="px-4 py-3 font-bold">Joined</th>
                <th className="px-4 py-3 font-bold">Last seen</th>
                <th className="px-4 py-3 font-bold">Platform</th>
                <th className="px-4 py-3 font-bold">Flags</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${u.id}`} className="t-body-sm font-semibold hover:underline underline-offset-4">
                      {u.email}
                    </Link>
                    <div className="t-body-sm text-muted-foreground">{u.full_name}</div>
                  </td>
                  <td className="px-4 py-3 t-body-sm text-muted-foreground font-mono">{date(u.created_at)}</td>
                  <td className="px-4 py-3 t-body-sm text-muted-foreground">{ago(u.last_seen_at)}</td>
                  <td className="px-4 py-3 t-body-sm text-muted-foreground">{u.last_app_mode ?? "web"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      {!u.is_onboarded && (
                        <span className="rounded-pill bg-[var(--warn-dim)] text-warn px-2 py-0.5 t-micro">
                          not onboarded
                        </span>
                      )}
                      {u.is_supporter && (
                        <span className="rounded-pill bg-accent text-[var(--accent-ink)] px-2 py-0.5 t-micro">
                          supporter
                        </span>
                      )}
                      <span className="rounded-pill bg-tile text-muted-foreground px-2 py-0.5 t-micro">
                        {u.currency}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="t-body-sm text-muted-foreground">
        Showing {users.length} (capped at 30). Empty search lists the newest accounts.
      </p>
    </div>
  );
}
