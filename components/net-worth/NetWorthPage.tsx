"use client";

import { useCallback, useState } from "react";
import { TrendingUp, PiggyBank } from "lucide-react";
import { useRegisterQuickAction } from "@/lib/providers/QuickActionProvider";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { DonutChart } from "@/components/ui/charts/DonutChart";
import { Progress } from "@/components/ui/Progress";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Chip } from "@/components/ui/Chip";
import { resolveColor } from "@/lib/theme/dataViz";
import NetWorthEmptyState from "./NetWorthEmptyState";
import { AddAssetSheet } from "./AddAssetSheet";
import { AssetDetailSheet, type AssetDetail } from "./AssetDetailSheet";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useEntitlement } from "@/lib/providers/EntitlementProvider";
import { usePaywallGate } from "@/lib/providers/PaywallProvider";
import { isAtLimit } from "@/lib/subscription/limits";

interface Asset {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  category_id: string | null;
  category_name: string;
  category_icon: string;
  value: number;
  invested_amount?: number;
  is_goal?: boolean;
  target_amount?: number | null;
  achieved_at?: string | null;
}

interface NetWorthData {
  assets: Asset[];
  totalLiabilities: number;
  netWorthHistory?: { net_worth: number | string; snapshot_date: string }[];
}

// ── Existing pie chart — unchanged ─────────────────────────────────────────────
function PieChart({ assets }: { assets: Asset[]; totalAssets: number }) {
  const data = assets
    .filter((a) => a.value > 0)
    .map((a) => ({
      id: a.id,
      label: a.name,
      value: a.value,
      color: resolveColor({ id: a.id, color: a.color }),
    }));
  return <DonutChart data={data} centerLabel="of assets" />;
}

// ── Net worth sparkline for the total card ─────────────────────────────────────
function NetWorthSparkline({
  history,
}: {
  history: { net_worth: number | string; snapshot_date: string }[];
}) {
  if (history.length < 2) return null;
  const values = history.map((d) => Number(d.net_worth));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 260;
  const H = 50;
  const pad = 4;
  const pts = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * (W - pad * 2),
    y: pad + (1 - (v - min) / range) * (H - pad * 2),
  }));
  const linePath = `M ${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" L ")}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full mt-3"
      style={{ height: 42 }}
    >
      <path
        d={linePath}
        fill="none"
        stroke="var(--accent-strong)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function NetWorthPage({ data }: { data: NetWorthData }) {
  const haptic = useHaptic();
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [addDefaultCategoryId, setAddDefaultCategoryId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "goals">("all");

  const allAssets = data.assets;
  const goalAssets = allAssets.filter((a) => a.is_goal);
  const assets = tab === "goals" ? goalAssets : allAssets;

  // Asset cap counts non-goal holdings (goals have their own cap on the Goals page).
  const { tier } = useEntitlement();
  const paywallGate = usePaywallGate();
  const nonGoalAssetCount = allAssets.filter((a) => !a.is_goal).length;
  const totalAssets = assets.reduce((s, a) => s + a.value, 0);
  const netWorth = totalAssets - data.totalLiabilities;
  const history = data.netWorthHistory ?? [];

  // Net worth change this month (absolute), for the total-card chip.
  let netWorthChange = 0;
  if (history.length > 1) {
    netWorthChange =
      Number(history[history.length - 1].net_worth) -
      Number(history[history.length - 2].net_worth);
  }

  // Derive from live data so sheet always reflects latest values
  const selectedAsset = selectedAssetId
    ? (() => {
        const a = allAssets.find(x => x.id === selectedAssetId);
        if (!a) return null;
        return {
          id: a.id,
          name: a.name,
          icon: a.icon ?? null,
          color: a.color ?? null,
          category_id: a.category_id,
          category_name: a.category_name,
          category_icon: a.category_icon,
          value: a.value,
          invested_amount: a.invested_amount ?? a.value,
          is_goal: Boolean(a.is_goal),
          target_amount: a.target_amount ?? null,
          achieved_at: a.achieved_at ?? null,
        } satisfies AssetDetail;
      })()
    : null;

  const now = new Date();
  const monthLabel = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  // Group assets by category
  const categoryGroups = assets.reduce<Map<string, { name: string; icon: string; id: string | null; assets: Asset[] }>>(
    (map, asset) => {
      const key = asset.category_id ?? "__uncategorized__";
      if (!map.has(key)) {
        map.set(key, {
          id: asset.category_id,
          name: asset.category_name,
          icon: asset.category_icon,
          assets: [],
        });
      }
      map.get(key)!.assets.push(asset);
      return map;
    },
    new Map()
  );

  function openAssetDetail(asset: Asset) {
    haptic.light();
    setSelectedAssetId(asset.id);
  }

  function openAddSheet(categoryId?: string | null) {
    haptic.light();
    if (!paywallGate(isAtLimit("assets", nonGoalAssetCount, tier), "assets")) {
      return;
    }
    setAddDefaultCategoryId(categoryId ?? null);
    setAddSheetOpen(true);
  }

  // Quick-action dock: add an asset. Dock owns the haptic, so skip it here.
  const openAddFromDock = useCallback(() => {
    if (!paywallGate(isAtLimit("assets", nonGoalAssetCount, tier), "assets")) {
      return;
    }
    setAddDefaultCategoryId(null);
    setAddSheetOpen(true);
  }, [paywallGate, nonGoalAssetCount, tier]);
  useRegisterQuickAction({
    id: "net-worth",
    label: "Add asset",
    icon: PiggyBank,
    onTrigger: openAddFromDock,
  });

  // Shared header row
  const header = (
    <div className="flex items-center justify-between px-1 pt-1">
      <div>
        <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground">
          Net worth
        </h1>
        <p className="text-[11px] font-medium text-muted-foreground mt-1">{monthLabel}</p>
      </div>
      <button
        onClick={() => openAddSheet()}
        className="flex size-[38px] items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Add asset"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
      </button>
    </div>
  );

  if (assets.length === 0) {
    return (
      <>
        <div className="px-4 pt-4 flex flex-col gap-3">
          {header}
          <NetWorthEmptyState onAddAsset={() => openAddSheet()} />
        </div>
        <AddAssetSheet open={addSheetOpen} onClose={() => setAddSheetOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="px-4 pt-4 flex flex-col gap-3">
        {header}

        {/* Total net worth — white card with sparkline */}
        <Card id="net-worth-hero">
          <div className="flex items-start justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Total net worth</span>
            {netWorthChange !== 0 && (
              <Chip tone="lime">
                {netWorthChange >= 0 ? "▲" : "▼"}{" "}
                <CurrencyText value={Math.abs(netWorthChange)} className="inline" /> this month
              </Chip>
            )}
          </div>
          <div className="figure text-[38px] mt-1.5 text-foreground">
            <CurrencyText value={netWorth} />
          </div>
          <div id="net-worth-chart-section">
            <NetWorthSparkline history={history} />
          </div>
        </Card>

        {/* Assets (dark) / Liabilities (white) stat pair */}
        <div className="flex gap-3">
          <StatCard
            icon={<TrendingUp size={16} strokeWidth={2} />}
            chip={<Chip tone="onDark">Growing</Chip>}
            label="Assets"
            value={<CurrencyText value={totalAssets} />}
            className="flex-1"
          />
          <StatCard
            icon={<span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>}
            chip={<Chip tone="neg">Owed</Chip>}
            label="Liabilities"
            value={
              <span className="text-neg">
                <CurrencyText value={data.totalLiabilities} />
              </span>
            }
            className="flex-1"
          />
        </div>

        {/* Holdings — donut card */}
        <Card id="net-worth-distribution-section">
          <div className="flex items-center justify-between mb-3">
            <span className="font-display text-[15px] font-bold text-foreground">Holdings</span>
            <span className="text-[10px] font-semibold text-muted-foreground">
              {assets.length} {assets.length === 1 ? "holding" : "holdings"}
            </span>
          </div>
          <PieChart assets={assets} totalAssets={totalAssets} />
        </Card>

        {/* Tabs: All / Goals */}
        <SegmentedControl
          variant="pill"
          options={[
            { label: "All", value: "all", count: allAssets.length },
            { label: "Goals", value: "goals", count: goalAssets.length },
          ]}
          value={tab}
          onChange={setTab}
        />

        {/* Category groups */}
        <div id="net-worth-assets-section" className="flex flex-col gap-3">
          {Array.from(categoryGroups.values()).map((group) => {
            const groupTotal = group.assets.reduce((s, a) => s + a.value, 0);
            return (
              <Card key={group.id ?? "uncategorized"}>
                {/* Group header */}
                <div className="flex justify-between items-baseline mb-1">
                  <span className="flex items-center gap-2 text-[14px] font-bold text-foreground">
                    <span className="text-base leading-none">{group.icon}</span>
                    {group.name}
                  </span>
                  <span className="figure text-[13px] text-foreground">
                    <CurrencyText value={groupTotal} />
                  </span>
                </div>

                {/* Asset rows */}
                <div className="flex flex-col">
                  {group.assets.map((asset) => {
                    const pct = groupTotal > 0 ? asset.value / groupTotal : 0;
                    const isGoalBar =
                      asset.is_goal && asset.target_amount && asset.target_amount > 0;
                    return (
                      <button
                        key={asset.id}
                        onClick={() => openAssetDetail(asset)}
                        className="w-full text-left py-3 border-t border-border first:border-t-0 active:scale-[0.99] transition-transform"
                      >
                        <div className="flex justify-between items-baseline gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-[3px] h-3.5 rounded-full shrink-0"
                              style={{ background: resolveColor({ id: asset.id, color: asset.color }) }}
                            />
                            {asset.is_goal && <span className="text-[13px] shrink-0">🎯</span>}
                            <span className="text-[14px] font-bold tracking-[-0.01em] text-foreground truncate">
                              {asset.name}
                            </span>
                          </div>
                          <span className="figure text-[13px] shrink-0 whitespace-nowrap text-foreground">
                            <CurrencyText value={asset.value} />
                            {isGoalBar && (
                              <span className="text-muted-foreground">
                                {" "}/ <CurrencyText value={Number(asset.target_amount)} />
                              </span>
                            )}
                          </span>
                        </div>
                        <Progress
                          className="mt-2 h-1.5"
                          value={
                            (isGoalBar
                              ? Math.min(1, asset.value / Number(asset.target_amount))
                              : pct) * 100
                          }
                          color={resolveColor({ id: asset.id, color: asset.color })}
                        />
                      </button>
                    );
                  })}

                  {/* Add to category */}
                  <button
                    onClick={() => openAddSheet(group.id)}
                    className="w-full py-3 flex items-center gap-2 text-[13px] font-bold text-muted-foreground hover:text-foreground border-t border-border transition-colors"
                  >
                    <span className="text-accent-strong text-base leading-none">＋</span>
                    <span>Add to {group.name}</span>
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <AddAssetSheet
        open={addSheetOpen}
        defaultCategoryId={addDefaultCategoryId}
        onClose={() => setAddSheetOpen(false)}
      />

      <AssetDetailSheet
        asset={selectedAsset}
        onClose={() => setSelectedAssetId(null)}
      />
    </>
  );
}
