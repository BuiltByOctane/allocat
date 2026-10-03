import Link from "next/link";
import type { FoundingMembersSummary } from "@/lib/admin/queries";
import { ago } from "@/lib/admin/format";

function tally<T extends string>(values: Array<T | null>): Array<[string, number]> {
  const out = new Map<string, number>();
  for (const v of values) out.set(v ?? "unknown", (out.get(v ?? "unknown") ?? 0) + 1);
  return [...out.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Founding-member ledger — the list we honour when Premium launches.
 * Breakdowns are over the loaded rows (capped), the headline total is exact.
 */
export function FoundingMemberList({ data }: { data: FoundingMembersSummary }) {
  const { total, rows } = data;

  if (total === 0) {
    return <p className="t-body-sm text-muted-foreground">No founding members yet.</p>;
  }

  const groups = [
    { title: "Platform", items: tally(rows.map((r) => r.platform)) },
    { title: "Source", items: tally(rows.map((r) => r.source)) },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="rounded-card bg-card p-4">
          <div className="t-label-sm text-muted-foreground">Founding members</div>
          <div className="font-display text-[32px] font-bold leading-none mt-2">{total}</div>
        </div>
        {groups.map((g) => (
          <div key={g.title} className="rounded-card bg-card p-4">
            <div className="t-label-sm text-muted-foreground">{g.title}</div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {g.items.map(([label, n]) => (
                <span key={label} className="rounded-pill bg-tile px-2.5 py-1 t-micro">
                  {label} · <span className="font-mono">{n}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-card bg-card divide-y divide-border">
        {rows.map((r) => (
          <div key={r.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <Link
              href={`/admin/users/${r.user_id}`}
              className="t-body-sm font-semibold truncate hover:underline underline-offset-4"
            >
              {r.email}
            </Link>
            <div className="flex items-center gap-2">
              {r.source === "kofi" && (
                <span className="rounded-pill bg-accent text-[var(--accent-ink)] px-2.5 py-1 t-micro">ko-fi</span>
              )}
              {r.platform && (
                <span className="rounded-pill bg-tile text-muted-foreground px-2.5 py-1 t-micro">{r.platform}</span>
              )}
              <span className="t-body-sm text-muted-foreground">{ago(r.claimed_at)}</span>
            </div>
          </div>
        ))}
      </div>
      {rows.length < total && (
        <p className="t-body-sm text-muted-foreground">Showing the newest {rows.length} of {total}.</p>
      )}
    </div>
  );
}
