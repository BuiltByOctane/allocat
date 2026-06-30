"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Inbox, Search } from "lucide-react";
import { Drawer } from "vaul";
import { useQuery } from "@tanstack/react-query";
import { getDB } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { useAllTransactions } from "@/lib/hooks/useSmsTransactions";
import { useTourDriver } from "@/lib/tour/useTourDriver";
import type { SmsTransactionRow } from "@/lib/db";

// ─── Item/category name lookup (read from IDB) ────────────────────────────────

interface ItemMeta {
  itemName: string;
  categoryName: string;
  /** Item's own emoji — preferred glyph. */
  emoji: string | null;
  /** Category icon — fallback glyph when the item has no emoji. */
  icon: string | null;
}

const LOOKUP_KEY = ["transactions", "lookup"] as const;

/** Map budget_item_id → { item, category } for resolving txn labels. */
async function loadItemLookup(): Promise<Record<string, ItemMeta>> {
  const db = getDB();
  const [items, categories] = await Promise.all([
    db.budget_items.toArray(),
    db.categories.toArray(),
  ]);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const lookup: Record<string, ItemMeta> = {};
  for (const it of items) {
    const cat = catById.get(it.category_id);
    lookup[it.id] = {
      itemName: it.name,
      categoryName: cat?.name ?? "",
      emoji: it.emoji ?? null,
      icon: cat?.icon ?? null,
    };
  }
  return lookup;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function whenOf(txn: SmsTransactionRow): string {
  return txn.occurred_at ?? txn.created_at;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function fullDateLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "Today" / "Yesterday" / "12 Jun 2026" for the day-group header. */
function dayHeading(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Earlier";
  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, yesterday)) return "Yesterday";
  return fullDateLabel(iso);
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  if (!key) return "All months";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

type SourceFilter = "all" | "sms" | "manual";

export default function TransactionsPage() {
  useTourDriver("transactions");
  const { data: txns, isLoading } = useAllTransactions();
  const { data: lookup } = useQuery({
    queryKey: LOOKUP_KEY,
    queryFn: loadItemLookup,
  });

  const [month, setMonth] = useState<string>(""); // "" = all
  const [itemFilter, setItemFilter] = useState<string>(""); // "" = all items
  const [source, setSource] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SmsTransactionRow | null>(null);

  const meta = lookup ?? {};
  const all = useMemo(() => txns ?? [], [txns]);

  // Month options derived from the data, newest first.
  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const t of all) {
      const k = monthKey(whenOf(t));
      if (k) keys.add(k);
    }
    return Array.from(keys).sort((a, b) => b.localeCompare(a));
  }, [all]);

  // Item options for the category/item filter.
  const itemOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const t of all) if (t.budget_item_id) ids.add(t.budget_item_id);
    return Array.from(ids)
      .map((id) => ({ id, name: meta[id]?.itemName ?? "Unknown item" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, lookup]);

  const labelOf = (t: SmsTransactionRow) =>
    t.label || t.merchant_raw || "Transaction";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((t) => {
      if (month && monthKey(whenOf(t)) !== month) return false;
      if (itemFilter && t.budget_item_id !== itemFilter) return false;
      if (source !== "all" && (t.source ?? "sms") !== source) return false;
      if (q) {
        const hay = `${t.label ?? ""} ${t.merchant_raw ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [all, month, itemFilter, source, search]);

  // Group filtered rows by day (already newest-first from the hook).
  const groups = useMemo(() => {
    const out: Array<{ heading: string; txns: SmsTransactionRow[] }> = [];
    const index = new Map<string, number>();
    for (const t of filtered) {
      const heading = dayHeading(whenOf(t));
      let pos = index.get(heading);
      if (pos === undefined) {
        pos = out.length;
        index.set(heading, pos);
        out.push({ heading, txns: [] });
      }
      out[pos].txns.push(t);
    }
    return out;
  }, [filtered]);

  const selMeta = selected?.budget_item_id ? meta[selected.budget_item_id] : undefined;

  return (
    <div className="px-4 pt-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 px-1 pt-1">
        <Link
          href="/profile"
          aria-label="Back"
          className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-foreground"
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </Link>
        <div>
          <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground">
            History
          </h1>
          <p className="text-[11px] font-medium text-muted-foreground mt-1">
            {`${filtered.length} transaction${filtered.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div id="transactions-filters" className="flex flex-col gap-2">
        {/* Search */}
        <div className="flex items-center gap-2 rounded-pill border border-border bg-card px-3.5 h-10">
          <Search size={15} strokeWidth={2} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or merchant"
            className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>

        {/* Selects + source segmented control */}
        <div className="flex flex-wrap gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="Month"
            className="h-9 rounded-pill border border-border bg-card px-3 text-[13px] font-semibold text-foreground focus:outline-none"
          >
            <option value="">All months</option>
            {monthOptions.map((k) => (
              <option key={k} value={k}>
                {monthLabel(k)}
              </option>
            ))}
          </select>

          <select
            value={itemFilter}
            onChange={(e) => setItemFilter(e.target.value)}
            aria-label="Budget item"
            className="h-9 max-w-[45%] rounded-pill border border-border bg-card px-3 text-[13px] font-semibold text-foreground focus:outline-none"
          >
            <option value="">All items</option>
            {itemOptions.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
              </option>
            ))}
          </select>
        </div>

        {/* Source filter */}
        <div id="transactions-source" className="flex gap-1 rounded-pill border border-border bg-card p-1">
          {(["all", "sms", "manual"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={`flex-1 h-8 rounded-pill text-[12px] font-bold capitalize transition-colors ${
                source === s
                  ? "bg-[var(--pill)] text-[var(--pill-foreground)]"
                  : "text-muted-foreground"
              }`}
            >
              {s === "all" ? "All" : s === "sms" ? "SMS" : "Manual"}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading && all.length === 0 ? (
        <p className="text-sm text-muted-foreground px-1">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-[14px] bg-tile text-muted-foreground mb-1">
            <Inbox size={24} strokeWidth={1.7} />
          </div>
          <p className="text-sm font-bold text-foreground">No transactions yet</p>
          <p className="max-w-[260px] text-xs text-muted-foreground">
            Your spending shows up here — auto-captured from bank SMS or logged by
            hand. Set up a budget, then log a spend to get started.
          </p>
          <Link
            href="/budget"
            className="mt-1 text-[13px] font-bold text-foreground"
          >
            Go to Budget →
          </Link>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section key={group.heading} className="flex flex-col gap-1.5">
              <h2 className="px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {group.heading}
              </h2>
              <div className="flex flex-col gap-1.5">
                {group.txns.map((txn) => {
                  const m = txn.budget_item_id ? meta[txn.budget_item_id] : undefined;
                  return (
                    <button
                      key={txn.id}
                      type="button"
                      onClick={() => setSelected(txn)}
                      className="w-full flex items-center gap-3 rounded-tile bg-card px-3.5 py-3 text-left transition-transform active:scale-[0.99]"
                    >
                      {(m?.emoji || m?.icon) && (
                        <span className="text-lg leading-none shrink-0">{m.emoji || m.icon}</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-bold text-foreground truncate">
                            {labelOf(txn)}
                          </p>
                          <span className="shrink-0 rounded-full bg-tile px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-muted-foreground">
                            {(txn.source ?? "sms") === "manual" ? "Manual" : "SMS"}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {[m?.itemName, m?.categoryName].filter(Boolean).join(" · ") ||
                            "Unallocated"}
                          {" · "}
                          {timeLabel(whenOf(txn))}
                        </p>
                      </div>
                      {typeof txn.amount === "number" ? (
                        <span className="figure text-[15px] text-foreground shrink-0">
                          <CurrencyText value={txn.amount} maximumFractionDigits={0} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="h-28 md:h-12" />

      {/* Detail drawer */}
      <Drawer.Root
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card focus:outline-none"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="mx-auto w-9 h-1 bg-border rounded-full" />
            </div>
            {selected && (
              <div className="px-6 pt-2 pb-safe">
                <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-border">
                  <span className="figure text-[28px] font-bold text-foreground">
                    {typeof selected.amount === "number" ? (
                      <CurrencyText value={selected.amount} maximumFractionDigits={0} />
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="shrink-0 rounded-full bg-tile px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                    {(selected.source ?? "sms") === "manual" ? "Manual" : "SMS"}
                  </span>
                </div>
                <Drawer.Title className="mt-3 text-[15px] font-bold text-foreground">
                  {labelOf(selected)}
                </Drawer.Title>

                <dl className="mt-3 space-y-2 text-sm">
                  <Row label="Item" value={selMeta?.itemName ?? "Unallocated"} />
                  <Row label="Category" value={selMeta?.categoryName || "—"} />
                  <Row label="Date" value={fullDateLabel(whenOf(selected))} />
                  <Row label="Time" value={timeLabel(whenOf(selected))} />
                  {typeof selected.original_amount === "number" && (
                    <Row
                      label="Originally"
                      value={
                        <CurrencyText
                          value={selected.original_amount}
                          maximumFractionDigits={0}
                        />
                      }
                    />
                  )}
                </dl>

                <div className="h-6" />
              </div>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-foreground text-right">{value}</dd>
    </div>
  );
}
