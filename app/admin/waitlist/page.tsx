import { requireAdmin } from "@/lib/admin/guard";
import { listWaitlist } from "@/lib/admin/queries";
import { Tile } from "@/components/admin/Tile";
import { num, pct, ago } from "@/lib/admin/format";

const PREFERENCE_LABEL: Record<string, string> = {
  native: "Native app",
  web: "Web app is fine",
  either: "Either",
};

/**
 * iOS auto-tracking waitlist from the landing site. The native/web split is the
 * input for deciding whether to build a native iOS app or stay a PWA.
 */
export default async function AdminWaitlistPage() {
  await requireAdmin();
  const w = await listWaitlist();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="t-heading text-foreground">iOS waitlist</h2>
        {w.total > 0 && (
          <a
            href="/api/admin/waitlist/csv"
            className="ml-auto rounded-pill bg-card px-3.5 py-2 t-body-sm font-bold text-foreground hover:bg-muted"
          >
            Export CSV
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <Tile label="Signups" value={num(w.total)} tone="accent" sub={`${num(w.new_7d)} in last 7d`} />
        <Tile label="Need native" value={num(w.native)} sub={pct(w.native, w.total)} />
        <Tile label="Web app is fine" value={num(w.web)} sub={pct(w.web, w.total)} />
        <Tile label="Either" value={num(w.either)} sub={pct(w.either, w.total)} />
        <Tile
          label="Web-OK share"
          value={pct(w.web + w.either, w.total)}
          sub="would accept a PWA"
        />
      </div>

      {w.total === 0 ? (
        <p className="t-body-sm text-muted-foreground">No signups yet.</p>
      ) : (
        <>
          <div className="rounded-card bg-card divide-y divide-border">
            {w.rows.map((r) => (
              <div key={r.email} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="t-body-sm font-semibold truncate">{r.email}</span>
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      "rounded-pill px-2.5 py-1 t-micro",
                      r.preference === "native"
                        ? "bg-accent text-[var(--accent-ink)]"
                        : "bg-tile text-muted-foreground",
                    ].join(" ")}
                  >
                    {PREFERENCE_LABEL[r.preference] ?? r.preference}
                  </span>
                  {r.platform && (
                    <span className="rounded-pill bg-tile text-muted-foreground px-2.5 py-1 t-micro">
                      {r.platform}
                    </span>
                  )}
                  {r.source && (
                    <span className="rounded-pill bg-tile text-muted-foreground px-2.5 py-1 t-micro">
                      {r.source === "home_section" ? "home" : r.source}
                    </span>
                  )}
                  <span className="t-body-sm text-muted-foreground">{ago(r.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
          {w.rows.length < w.total && (
            <p className="t-body-sm text-muted-foreground">
              Showing the newest {w.rows.length} of {w.total}. Export CSV for all.
            </p>
          )}
        </>
      )}
    </div>
  );
}
