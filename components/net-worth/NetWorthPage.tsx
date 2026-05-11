"use client";

import { useState } from "react";
import { CurrencyText } from "@/components/ui/CurrencyText";
import NetWorthEmptyState from "./NetWorthEmptyState";
import { AddAssetSheet } from "./AddAssetSheet";
import { AssetDetailSheet, type AssetDetail } from "./AssetDetailSheet";
import { useHaptic } from "@/lib/hooks/useHaptic";

interface Asset {
  id: string;
  name: string;
  icon?: string | null;
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
function PieChart({ assets, totalAssets }: { assets: Asset[]; totalAssets: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const gap = totalAssets > 0 && assets.filter((a) => a.value > 0).length > 1 ? 1.5 : 0;
  const sorted = [...assets].filter((a) => a.value > 0).sort((a, b) => b.value - a.value);

  const STYLES = [
    { stroke: "stroke-foreground opacity-100", bg: "bg-foreground opacity-100" },
    { stroke: "stroke-foreground opacity-80", bg: "bg-foreground opacity-80" },
    { stroke: "stroke-foreground opacity-60", bg: "bg-foreground opacity-60" },
    { stroke: "stroke-foreground opacity-40", bg: "bg-foreground opacity-40" },
    { stroke: "stroke-foreground opacity-20", bg: "bg-foreground opacity-20" },
  ];

  let currentOffset = 0;

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative w-40 h-40 flex items-center justify-center">
        <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
          <circle cx="80" cy="80" r={r} fill="none" className="stroke-muted/20" strokeWidth="80" />
          {totalAssets > 0 &&
            sorted.map((asset, i) => {
              const pct = asset.value / totalAssets;
              const dash = Math.max(pct * circ - gap, 0);
              const offset = -currentOffset;
              currentOffset += pct * circ;
              const style = STYLES[i % STYLES.length];
              return (
                <circle
                  key={asset.id}
                  cx="80"
                  cy="80"
                  r={r}
                  fill="none"
                  className={style.stroke}
                  strokeWidth="80"
                  strokeDasharray={`${dash} ${circ}`}
                  strokeDashoffset={offset}
                  strokeLinecap="butt"
                />
              );
            })}
        </svg>
      </div>
      {sorted.length > 0 && (
        <div className="w-full mt-5 space-y-2 px-1">
          {sorted.map((asset, i) => {
            const pct = totalAssets > 0 ? ((asset.value / totalAssets) * 100).toFixed(1).replace(/\.0$/, "") : "0";
            const style = STYLES[i % STYLES.length];
            return (
              <div key={asset.id} className="flex items-center justify-between text-xs w-full">
                <div className="flex items-center gap-2 flex-1 min-w-0 pr-3">
                  <div className={`w-3 h-3 shrink-0 rounded-[3px] ${style.bg}`} />
                  <span className="text-muted-foreground truncate uppercase tracking-wider text-[10px] font-medium">
                    {asset.name}
                  </span>
                </div>
                <span className="font-semibold tabular-nums text-foreground shrink-0">{pct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Monthly net worth variation chart ──────────────────────────────────────────
function NetWorthVariationChart({
  history,
}: {
  history: { net_worth: number | string; snapshot_date: string }[];
}) {
  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const fmtMonth = (d: string) => {
    const [, m] = d.split("-");
    return MONTH_LABELS[parseInt(m, 10) - 1] ?? d;
  };

  if (history.length < 2) {
    return (
      <div className="px-7 py-5 bg-card">
        <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-3">
          Net worth trend
        </div>
        <div className="h-[80px] flex items-center justify-center border border-dashed" style={{ borderColor: "var(--border)" }}>
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase" style={{ color: "var(--dimmer)" }}>
            Building history…
          </span>
        </div>
      </div>
    );
  }

  const values = history.map((d) => Number(d.net_worth));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 400;
  const H = 96;
  const pad = 8;

  const pts = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * (W - pad * 2),
    y: pad + (1 - (v - min) / range) * (H - pad * 2),
  }));

  const linePath = `M ${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" L ")}`;
  const areaPath = `M ${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" L ")} L ${W - pad},${H} L ${pad},${H} Z`;

  // zero line
  const zeroY = pad + (1 - (0 - min) / range) * (H - pad * 2);
  const showZero = min < 0 && max > 0;

  // up to 6 evenly spaced month labels
  const labelCount = Math.min(history.length, 6);
  const labelIndices = Array.from({ length: labelCount }, (_, i) =>
    Math.round(i * (history.length - 1) / (labelCount - 1))
  );

  return (
    <div className="px-7 py-5 bg-card">
      <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-3">
        Net worth trend
      </div>
      <div className="w-full h-[96px]">
        <svg viewBox={`0 0 ${W} ${H}`} fill="none" preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="nwAreaGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0.10" />
              <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {showZero && (
            <line
              x1={pad} x2={W - pad} y1={zeroY} y2={zeroY}
              stroke="var(--dimmer)" strokeWidth="0.5" strokeDasharray="3 4"
            />
          )}
          <path d={areaPath} fill="url(#nwAreaGrad)" />
          <path d={linePath} stroke="var(--foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.5" fill="var(--foreground)" />
        </svg>
      </div>
      <div className="flex justify-between mt-1.5">
        {labelIndices.map((idx) => (
          <span key={idx} className="font-mono text-[9px] tracking-[0.08em]" style={{ color: "var(--dimmer)" }}>
            {fmtMonth(history[idx].snapshot_date)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Segmented progress bar ─────────────────────────────────────────────────────
function SegBar({ pct }: { pct: number }) {
  const count = 20;
  return (
    <div className="flex gap-[2px] mt-2.5">
      {Array.from({ length: count }).map((_, j) => (
        <div
          key={j}
          className="flex-1"
          style={{
            height: 3,
            background: j / count < pct ? "var(--foreground)" : "var(--progress-empty)",
          }}
        />
      ))}
    </div>
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
  const totalAssets = assets.reduce((s, a) => s + a.value, 0);
  const netWorth = totalAssets - data.totalLiabilities;
  const history = data.netWorthHistory ?? [];

  // Derive from live data so sheet always reflects latest values
  const selectedAsset = selectedAssetId
    ? (() => {
        const a = allAssets.find(x => x.id === selectedAssetId);
        if (!a) return null;
        return {
          id: a.id,
          name: a.name,
          icon: a.icon ?? null,
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
  const monthLabel = `${MONTHS[now.getMonth()].substring(0, 3)} ${now.getFullYear()}`;

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
    setAddDefaultCategoryId(categoryId ?? null);
    setAddSheetOpen(true);
  }

  if (assets.length === 0) {
    return (
      <>
        {/* Masthead */}
        <div className="sticky top-0 z-10 bg-background">
          <div className="px-7 pt-6 pb-[18px] flex items-end justify-between">
            <div>
              <div className="font-display text-[32px] leading-none tracking-[-0.02em] text-foreground">Net Worth</div>
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mt-2">
                Ledger · {monthLabel}
              </div>
            </div>
            <button
              onClick={() => openAddSheet()}
              className="size-[34px] rounded-full border border-border flex items-center justify-center text-foreground hover:border-foreground transition-colors"
              aria-label="Add asset"
            >
              <span className="font-sans text-lg font-light leading-none">+</span>
            </button>
          </div>
          <div className="h-px bg-border mx-7" />
        </div>
        <main className="p-4">
          <NetWorthEmptyState onAddAsset={() => openAddSheet()} />
        </main>
        <AddAssetSheet open={addSheetOpen} onClose={() => setAddSheetOpen(false)} />
      </>
    );
  }

  return (
    <>
      {/* Masthead */}
      <div className="fixed w-full top-0 z-10 bg-background">
        <div className="px-7 pt-6 pb-[18px] flex items-end justify-between">
          <div>
            <div className="font-display text-[32px] leading-none tracking-[-0.02em] text-foreground">Net Worth</div>
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mt-2">
              Ledger · {monthLabel}
            </div>
          </div>
          <button
            onClick={() => openAddSheet()}
            className="size-[34px] rounded-full border border-border flex items-center justify-center text-foreground hover:border-foreground transition-colors shrink-0"
            aria-label="Add asset"
          >
            <span className="font-sans text-lg font-light leading-none">+</span>
          </button>
        </div>
        <div className="h-px bg-border mx-7" />
      </div>

      {/* Hero — total net worth */}
      <div id="net-worth-hero" className="px-7 pt-[26px] pb-[22px] mt-20">
        <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
          Total net worth
        </div>
        <div
          className="font-display max-w-full leading-[0.95] tracking-[-0.025em] mt-2.5 text-foreground"
          style={{ fontSize: 60 }}
        >
          <CurrencyText value={netWorth} />
        </div>
        <div className="flex gap-[18px] mt-3.5 font-mono text-[11px] text-muted-foreground flex-wrap">
          <span className="whitespace-nowrap">
            ↳ assets <CurrencyText value={totalAssets} />
          </span>
          <span className="text-foreground whitespace-nowrap">
            · liab <CurrencyText value={-data.totalLiabilities} />
          </span>
        </div>
      </div>

      <div className="h-px bg-border mx-7" />

      {/* Assets / Liabilities split */}
      <div className="px-7 py-5 grid grid-cols-2 bg-card">
        <div>
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
            Total assets
          </div>
          <div className="mt-1">
            <CurrencyText value={totalAssets} className="text-[32px] leading-none tracking-[-0.02em] text-foreground" />
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
            Total liabilities
          </div>
          <div className="mt-1">
            <CurrencyText value={-data.totalLiabilities} className="text-[32px] leading-none tracking-[-0.02em] text-foreground" />
          </div>
        </div>
      </div>

      {/* Monthly net worth trend chart */}
      <div id="net-worth-chart-section bg-card">
      <NetWorthVariationChart history={history} />
      </div>

      <div className="h-px bg-border mx-7" />


      {/* Asset distribution */}
      <div id="net-worth-distribution-section" className="px-7 pt-5 pb-3 flex justify-between items-baseline">
        <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
          Asset distribution
        </div>
        <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
          {assets.length} holdings
        </div>
      </div>
  {/* Existing pie chart — unchanged */}
      <div className="px-7 pb-6 flex justify-center">
        <PieChart assets={assets} totalAssets={totalAssets} />
      </div>
      {/* Tabs: All / Goals */}
      <div className="px-7 pt-4 flex gap-1">
        {(["all", "goals"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { haptic.light(); setTab(t); }}
            className={`font-mono text-[10px] tracking-[0.14em] uppercase px-3 py-2 border-b-2 transition-colors ${
              tab === t ? "text-foreground border-foreground" : "text-muted-foreground border-transparent"
            }`}
          >
            {t === "all" ? `All · ${allAssets.length}` : `Goals · ${goalAssets.length}`}
          </button>
        ))}
      </div>
    

      <div className="h-px bg-border mx-7" />

      {/* Category groups — ledger style */}
      <div id="net-worth-assets-section">
      {Array.from(categoryGroups.values()).map((group) => {
        const groupTotal = group.assets.reduce((s, a) => s + a.value, 0);
        return (
          <div key={group.id ?? "uncategorized"}>
            {/* Group header */}
            <div className="px-7 pt-5 pb-3 flex justify-between items-baseline">
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                {group.name}
              </div>
              <div className="font-mono text-[12px] tabular-nums text-foreground">
                <CurrencyText value={groupTotal} />
              </div>
            </div>

            {/* Asset rows */}
            <div className="px-7">
              {group.assets.map((asset, i) => {
                const pct = groupTotal > 0 ? asset.value / groupTotal : 0;
                return (
                  <button
                    key={asset.id}
                    onClick={() => openAssetDetail(asset)}
                    className="w-full text-left"
                  >
                    <div
                      style={{
                        paddingTop: 14,
                        paddingBottom: 14,
                        borderTop: i === 0 ? "1px solid var(--border)" : "none",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <div className="flex justify-between items-baseline gap-3">
                        <div className="flex items-baseline gap-2.5 min-w-0">
                          <span className="font-mono text-[10px] shrink-0" style={{ color: "var(--dimmer)" }}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          {asset.is_goal && <span className="text-[14px] shrink-0">🎯</span>}
                          <span className="text-[17px] font-medium tracking-[-0.01em] text-foreground truncate">
                            {asset.name}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                            · {asset.category_name}
                          </span>
                        </div>
                        <div className="font-mono text-[12px] tabular-nums shrink-0 whitespace-nowrap text-foreground">
                          <CurrencyText value={asset.value} />
                          {asset.is_goal && asset.target_amount && asset.target_amount > 0 && (
                            <span className="text-muted-foreground">
                              {" "}/ <CurrencyText value={Number(asset.target_amount)} />
                            </span>
                          )}
                        </div>
                      </div>
                      <SegBar
                        pct={
                          asset.is_goal && asset.target_amount && asset.target_amount > 0
                            ? Math.min(1, asset.value / Number(asset.target_amount))
                            : pct
                        }
                      />
                    </div>
                  </button>
                );
              })}

              {/* Add to category */}
              <button
                onClick={() => openAddSheet(group.id)}
                className="w-full py-[14px] flex items-center gap-2.5 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground hover:text-foreground transition-colors"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <span className="text-foreground">+</span>
                <span>Add to {group.name}</span>
              </button>
            </div>
          </div>
        );
      })}
      </div>

      {/* Bottom spacer for mobile nav */}
      <div className="h-8" />

      {/* Sticky footer CTA */}
      <div
        className="sticky bottom-[72px] px-[22px] pb-4 pt-3 bg-background"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <button
          id="net-worth-add-btn"
          onClick={() => openAddSheet()}
          className="w-full py-[14px] flex items-center justify-center gap-2.5 font-mono text-[11px] tracking-[0.18em] uppercase text-foreground border border-foreground hover:bg-foreground hover:text-background transition-colors active:scale-[0.99]"
        >
          <span>+</span>
          <span>Add asset</span>
        </button>
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
