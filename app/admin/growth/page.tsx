import { requireAdmin } from "@/lib/admin/guard";
import { getOverview, getDailySeries, getFeatureUsage, listInstalls } from "@/lib/admin/queries";
import { Tile } from "@/components/admin/Tile";
import { Sparkline } from "@/components/admin/charts/Sparkline";
import { BarSeries } from "@/components/admin/charts/BarSeries";
import { SyncInstallsButton } from "@/components/admin/SyncInstallsButton";
import { num, pct, ago } from "@/lib/admin/format";
import Link from "next/link";

export default async function AdminGrowthPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdmin();
  const { days: daysParam } = await searchParams;
  const days = daysParam === "90" ? 90 : 30;

  const [o, series, usage, installs] = await Promise.all([
    getOverview(),
    getDailySeries(days),
    getFeatureUsage(),
    listInstalls(days),
  ]);

  // Landing views → Play clicks → installs → signups → onboarded → still active.
  // Each stage is measured independently, so the ratios are directional rather
  // than a true cohort funnel — worth remembering before reading too much in.
  const windowInstalls = series.reduce((a, d) => a + d.installs, 0);
  const funnel = [
    { label: "Landing views", value: series.length ? o.landing.views_7d : 0, note: "last 7d" },
    { label: "Play clicks", value: o.landing.play_clicks_7d, note: "last 7d" },
    { label: "Installs", value: windowInstalls, note: `last ${days}d` },
    { label: "Signups", value: series.reduce((a, d) => a + d.signups, 0), note: `last ${days}d` },
    { label: "Onboarded", value: o.users.onboarded, note: "all time" },
    { label: "Active 30d", value: o.active.mau, note: "all time" },
  ];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  const tab = (d: number) =>
    [
      "rounded-pill px-3.5 py-2 t-body-sm font-bold",
      days === d ? "bg-[var(--pill)] text-[var(--pill-foreground)]" : "bg-card text-muted-foreground",
    ].join(" ");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/growth?days=30" className={tab(30)}>
          30 days
        </Link>
        <Link href="/admin/growth?days=90" className={tab(90)}>
          90 days
        </Link>
        <div className="ml-auto">
          <SyncInstallsButton />
        </div>
      </div>

      <section>
        <h2 className="t-label text-muted-foreground mb-2.5">Funnel</h2>
        <div className="rounded-card bg-card p-5 flex flex-col gap-3">
          {funnel.map((f) => (
            <div key={f.label} className="flex items-center gap-3">
              <div className="w-[110px] shrink-0 t-body-sm text-muted-foreground">{f.label}</div>
              <div className="flex-1 h-6 rounded-tile bg-tile overflow-hidden">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${Math.max(2, (f.value / funnelMax) * 100)}%` }}
                />
              </div>
              <div className="w-[110px] shrink-0 text-right">
                <span className="font-mono t-body-sm font-bold">{num(f.value)}</span>{" "}
                <span className="t-body-sm text-muted-foreground">{f.note}</span>
              </div>
            </div>
          ))}
          <p className="t-body-sm text-muted-foreground">
            Stages are measured independently over different windows — read them as directional,
            not as one cohort walking through.
          </p>
        </div>
      </section>

      <section>
        <h2 className="t-label text-muted-foreground mb-2.5">Play installs</h2>
        <div className="rounded-card bg-card p-5">
          {installs.length === 0 ? (
            <p className="t-body-sm text-muted-foreground">
              Nothing synced yet. Set <span className="font-mono">PLAY_SA_JSON_B64</span> and{" "}
              <span className="font-mono">PLAY_BUCKET</span>, then hit Sync now.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-6 mb-3">
                <div>
                  <div className="t-label-sm text-muted-foreground">Active devices</div>
                  <div className="figure text-[22px] font-mono">
                    {num(o.installs.active_devices ?? null)}
                  </div>
                </div>
                <div>
                  <div className="t-label-sm text-muted-foreground">Total user installs</div>
                  <div className="figure text-[22px] font-mono">
                    {num(o.installs.total_users ?? null)}
                  </div>
                </div>
                <div>
                  <div className="t-label-sm text-muted-foreground">Last sync</div>
                  <div className="t-body-sm">{ago(o.installs.synced_at)}</div>
                </div>
              </div>
              <BarSeries
                data={installs.map((i) => ({
                  label: i.day,
                  up: i.daily_device_installs ?? 0,
                  down: i.daily_device_uninstalls ?? 0,
                }))}
              />
              <p className="t-body-sm text-muted-foreground mt-2">
                Green installs, red uninstalls. Play lags ~1 day and the current month&apos;s report
                is partial.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-2.5">
        <div className="rounded-stat bg-card p-4">
          <div className="t-label-sm text-muted-foreground mb-1">Signups</div>
          <Sparkline values={series.map((d) => d.signups)} height={48} />
        </div>
        <div className="rounded-stat bg-card p-4">
          <div className="t-label-sm text-muted-foreground mb-1">Active</div>
          <Sparkline values={series.map((d) => d.active_users)} height={48} stroke="var(--info)" />
        </div>
        <div className="rounded-stat bg-card p-4">
          <div className="t-label-sm text-muted-foreground mb-1">AI messages</div>
          <Sparkline values={series.map((d) => d.ai_messages)} height={48} stroke="var(--cat-4)" />
        </div>
      </section>

      <section>
        <h2 className="t-label text-muted-foreground mb-2.5">Feature adoption</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Tile
            label="SMS users"
            value={num(usage.sms_users)}
            sub={`${num(usage.sms_pending)} pending · ${num(usage.sms_categorized)} categorized`}
          />
          <Tile
            label="Merchant rules"
            value={num(usage.merchant_rules)}
            sub={`${num(usage.rule_applications)} auto-applies`}
          />
          <Tile
            label="Goals"
            value={num(usage.goals)}
            sub={`${num(usage.goals_achieved)} achieved · ${pct(usage.goals_achieved, usage.goals)}`}
          />
          <Tile label="Push opt-in" value={`${usage.push_optin_pct}%`} sub={`${num(usage.debts)} debts tracked`} />
        </div>
        <div className="rounded-stat bg-card p-4 mt-2.5">
          <div className="t-label-sm text-muted-foreground mb-2">By currency</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(usage.by_currency).map(([k, v]) => (
              <span key={k} className="rounded-pill bg-tile px-2.5 py-1 t-body-sm font-mono">
                {k} {v}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
