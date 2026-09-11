import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { searchUsers, ADMIN_USER_SORTS, type AdminUserSort, type SortDir } from "@/lib/admin/queries";
import { ago, date, num } from "@/lib/admin/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";

const PAGE_SIZE = 25;

/** Columns that read better newest/most-true first on their first click. */
const DESC_FIRST: AdminUserSort[] = ["created_at", "last_seen_at", "is_supporter", "is_onboarded"];

function parseSort(raw: string | undefined): AdminUserSort {
  return (ADMIN_USER_SORTS as readonly string[]).includes(raw ?? "")
    ? (raw as AdminUserSort)
    : "created_at";
}

interface TableState {
  q: string;
  sort: AdminUserSort;
  dir: SortDir;
  page: number;
}

/** Every link keeps the whole state — search stays bookmarkable and back works. */
function buildHref(state: TableState, next: Partial<TableState>): string {
  const { q, sort, dir, page } = { ...state, ...next };
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (sort !== "created_at") sp.set("sort", sort);
  if (dir !== "desc") sp.set("dir", dir);
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `/admin/users?${qs}` : "/admin/users";
}

function SortTh({ label, col, state }: { label: string; col: AdminUserSort; state: TableState }) {
  const active = state.sort === col;
  // Clicking the active column flips it; a fresh column starts in its natural direction.
  const nextDir: SortDir = active
    ? state.dir === "asc"
      ? "desc"
      : "asc"
    : DESC_FIRST.includes(col)
      ? "desc"
      : "asc";
  return (
    <th className="px-4 py-3 font-bold">
      <Link
        href={buildHref(state, { sort: col, dir: nextDir, page: 1 })}
        className={`inline-flex items-center gap-0.5 hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {label}
        <MaterialSymbol
          icon={active ? (state.dir === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more"}
          className={`text-[14px] leading-none ${active ? "" : "opacity-35"}`}
        />
      </Link>
    </th>
  );
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; sort?: string; dir?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const q = params.q ?? "";
  const sort = parseSort(params.sort);
  const dir: SortDir = params.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { rows, total } = await searchUsers(q, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    sort,
    dir,
  });

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = (page - 1) * PAGE_SIZE + rows.length;

  const state: TableState = { q, sort, dir, page };
  const href = (next: Partial<TableState>) => buildHref(state, next);

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
        {/* A new search resets to page 1; sort is worth carrying over. */}
        {sort !== "created_at" && <input type="hidden" name="sort" value={sort} />}
        {dir !== "desc" && <input type="hidden" name="dir" value={dir} />}
        <button
          type="submit"
          className="rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] px-5 t-body-sm font-bold"
        >
          Search
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon="person_search"
          title={total > 0 ? "Page is empty" : "No users match"}
          description={
            total > 0 ? "That page is past the end of the results." : q ? `Nothing for “${q}”.` : undefined
          }
          action={total > 0 ? { label: "Back to page 1", href: href({ page: 1 }) } : undefined}
        />
      ) : (
        <div className="rounded-card bg-card overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="t-label-sm text-muted-foreground">
                <SortTh label="User" col="email" state={state} />
                <SortTh label="Joined" col="created_at" state={state} />
                <SortTh label="Last seen" col="last_seen_at" state={state} />
                <SortTh label="Platform" col="last_app_mode" state={state} />
                <SortTh label="Flags" col="is_supporter" state={state} />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="t-body-sm text-muted-foreground">
          {total === 0 ? "No users" : `${num(first)}–${num(last)} of ${num(total)}`}
          {q ? "" : " · newest accounts first by default"}
        </p>

        {pageCount > 1 && (
          <nav className="flex items-center gap-2" aria-label="Pagination">
            <PageLink href={href({ page: page - 1 })} disabled={page <= 1} icon="chevron_left" label="Previous" />
            <span className="t-body-sm text-muted-foreground tabular-nums">
              Page {num(page)} / {num(pageCount)}
            </span>
            <PageLink
              href={href({ page: page + 1 })}
              disabled={page >= pageCount}
              icon="chevron_right"
              label="Next"
            />
          </nav>
        )}
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  icon,
  label,
}: {
  href: string;
  disabled: boolean;
  icon: string;
  label: string;
}) {
  const base = "flex items-center justify-center size-9 rounded-pill bg-card border border-border";
  if (disabled) {
    return (
      <span className={`${base} text-muted-foreground opacity-40`} aria-disabled="true" aria-label={label}>
        <MaterialSymbol icon={icon} className="text-[18px]" />
      </span>
    );
  }
  return (
    <Link href={href} className={`${base} text-foreground hover:border-foreground/40`} aria-label={label}>
      <MaterialSymbol icon={icon} className="text-[18px]" />
    </Link>
  );
}
