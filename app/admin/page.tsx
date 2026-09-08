import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { getOverview, getDailySeries, getPushReach } from "@/lib/admin/queries";
import { Tile } from "@/components/admin/Tile";
import { Sparkline } from "@/components/admin/charts/Sparkline";
import { num, pct, ago } from "@/lib/admin/format";

export default async function AdminOverviewPage() {
  await requireAdmin();

  const [o, series, reach] = await Promise.all([
    getOverview(),
    getDailySeries(30),
    getPushReach().catch(() => null),
  ]);

  const signups = series.map((d) => d.signups);
  const active = series.map((d) => d.active_users);

  // Things worth acting on today. Empty array ⇒ the strip is hidden entirely.
  const attention: Array<{ text: string; href: string }> = [];
  if (o.feedback.unresolved > 0) {
    attention.push({
      text: `${o.feedback.unresolved} unresolved feedback${o.feedback.bugs ? ` (${o.feedback.bugs} bugs)` : ""}`,
      href: "/admin/support",
    });
  }
  if (o.supporters.unlinked > 0) {
    attention.push({
      text: `${o.supporters.unlinked} donation${o.supporters.unlinked > 1 ? "s" : ""} not linked to an account`,
      href: "/admin/support?tab=supporters",
    });
  }
  if (o.ai.capped_today > 0) {
    attention.push({
      text: `${o.ai.capped_today} account${o.ai.capped_today > 1 ? "s" : ""} hit the daily AI cap`,
      href: "/admin/growth",
    });
  }
  if (!o.installs.day) {
    attention.push({ text: "Play install stats have never synced", href: "/admin/growth" });
  }

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h2 className="t-label text-muted-foreground mb-2.5">People</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Tile
            label="Total users"
            value={num(o.users.total)}
            sub={`${num(o.users.onboarded)} onboarded · ${pct(o.users.onboarded, o.users.total)}`}
          />
          <Tile label="New · 7d" value={num(o.users.new_7d)} sub={`${num(o.users.new_30d)} in 30d`} tone="accent" />
          <Tile
            label="Active · 1d"
            value={num(o.active.dau)}
            sub={`${num(o.active.wau)} weekly · ${num(o.active.mau)} monthly`}
          />
          <Tile
            label="Android / Web"
            value={`${num(o.users.android)} / ${num(o.users.web)}`}
            // Stamped client-side once per day, so an account counts as "web"
            // until its owner next opens the app — expect this to skew web for
            // roughly a day after deploy.
            sub={`${pct(o.users.android, o.users.total)} native · counted on next open`}
          />
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-2.5">
        <div className="rounded-stat bg-card p-4">
          <div className="t-label-sm text-muted-foreground mb-1">Signups · 30d</div>
          <div className="figure text-[22px] font-mono mb-2">{num(signups.reduce((a, b) => a + b, 0))}</div>
          <Sparkline values={signups} height={52} />
        </div>
        <div className="rounded-stat bg-card p-4">
          <div className="t-label-sm text-muted-foreground mb-1">Daily active · 30d</div>
          <div className="figure text-[22px] font-mono mb-2">{num(o.active.dau)}</div>
          <Sparkline values={active} height={52} stroke="var(--info)" />
          {/* History starts at the migration — there is nothing to backfill,
              since per-day activity was never recorded before it. */}
          {active.every((v) => v === 0) && (
            <p className="t-body-sm text-muted-foreground mt-1">
              Fills in as users open the app; no history before the rollout.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="t-label text-muted-foreground mb-2.5">Reach &amp; usage</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Tile
            label="Play installs"
            value={num(o.installs.active_devices ?? null)}
            sub={
              o.installs.day
                ? `active devices · synced ${ago(o.installs.synced_at)}`
                : "never synced"
            }
          />
          <Tile
            label="Push reach"
            value={num(reach ? reach.fcm_tokens + reach.web_subscriptions : o.push.subscriptions)}
            sub={
              reach
                ? `${num(reach.fcm_tokens)} Android · ${num(reach.web_subscriptions)} browser`
                : `${num(o.push.subscriptions)} devices`
            }
          />
          <Tile
            label="AI messages today"
            value={num(o.ai.messages_today)}
            sub={`${num(o.ai.users_today)} users · ${num(o.ai.capped_today)} capped`}
          />
          <Tile
            label="SMS txns · 7d"
            value={num(o.sms.txns_7d)}
            sub={`${num(o.sms.users)} users total`}
          />
        </div>
      </section>

      <section>
        <h2 className="t-label text-muted-foreground mb-2.5">Support</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Tile
            label="Supporters"
            value={num(o.supporters.count)}
            sub={`${o.supporters.total_amount ? o.supporters.total_amount.toLocaleString("en-US") : 0} donated`}
          />
          <Tile
            label="Open feedback"
            value={num(o.feedback.unresolved)}
            tone={o.feedback.unresolved > 0 ? "warn" : "default"}
            sub={`${num(o.feedback.bugs)} bugs`}
          />
          <Tile label="Landing views · 7d" value={num(o.landing.views_7d)} />
          <Tile
            label="Play clicks · 7d"
            value={num(o.landing.play_clicks_7d)}
            sub={
              o.landing.views_7d
                ? `${pct(o.landing.play_clicks_7d, o.landing.views_7d)} of views`
                : "beacon not wired yet"
            }
          />
        </div>
      </section>

      {attention.length > 0 && (
        <section className="rounded-stat bg-[var(--warn-dim)] p-4">
          <h2 className="t-label text-warn mb-2">Needs attention</h2>
          <ul className="flex flex-col gap-1.5">
            {attention.map((a) => (
              <li key={a.text}>
                <Link
                  href={a.href}
                  className="t-body-sm font-semibold text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
                >
                  {a.text}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="t-body-sm text-muted-foreground">
        Generated {ago(o.generated_at)}. All figures are live reads — no caching.
      </p>
    </div>
  );
}
