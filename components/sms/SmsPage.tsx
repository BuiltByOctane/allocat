"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, Inbox } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDB } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { formatCurrency } from "@/lib/number-format";
import {
  usePendingSms,
  useCategorizeSms,
  useIgnoreSms,
} from "@/lib/hooks/useSmsTransactions";
import { useAddBudgetItem } from "@/lib/hooks/useBudget";
import {
  ItemDetailSheet,
  NEW_ITEM_ID,
  type LinkTarget,
} from "@/components/budget/ItemDetailSheet";
import {
  AllocateSheet,
  type AllocatePickerItem,
  type AllocateCategory,
} from "@/components/sms/AllocateSheet";
import type { SmsTransactionRow } from "@/lib/db";

const SMS_PICKER_KEY = ["sms-picker"] as const;

type CategoryType = "needs" | "wants" | "investments" | "misc" | null;

interface CatMeta {
  name: string;
  icon: string | null;
  type: CategoryType;
  allocation: number;
  /** Σ planned of the category's existing items (the "other items" for a new one). */
  plannedTotal: number;
}

interface PickerData {
  items: AllocatePickerItem[];
  categories: AllocateCategory[];
  metaById: Record<string, CatMeta>;
}

/** Budget items + categories for the current month, read from IDB. */
async function loadPickerData(): Promise<PickerData> {
  const db = getDB();
  const now = new Date();
  const budget = await db.budgets
    .where("[month+year]")
    .equals([now.getMonth() + 1, now.getFullYear()])
    .first();
  if (!budget) return { items: [], categories: [], metaById: {} };

  const categories = await db.categories
    .where("budget_id")
    .equals(budget.id)
    .toArray();

  const items: AllocatePickerItem[] = [];
  const metaById: Record<string, CatMeta> = {};

  for (const cat of categories) {
    const catItems = await db.budget_items
      .where("category_id")
      .equals(cat.id)
      .toArray();
    for (const item of catItems) {
      items.push({
        id: item.id,
        itemName: item.name,
        categoryName: cat.name,
        icon: cat.icon,
      });
    }
    metaById[cat.id] = {
      name: cat.name,
      icon: cat.icon,
      type: (cat.type as CategoryType) ?? null,
      allocation: Number(cat.allocated_amount) || 0,
      plannedTotal: catItems.reduce((s, i) => s + (Number(i.planned_amount) || 0), 0),
    };
  }

  return {
    items,
    categories: categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
    metaById,
  };
}

function money(row: SmsTransactionRow): string {
  if (typeof row.amount !== "number") return "—";
  return formatCurrency(row.amount, {
    code: row.currency ?? "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function txnDate(row: SmsTransactionRow): string | null {
  if (!row.occurred_at) return null;
  const d = new Date(row.occurred_at);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function SmsPage() {
  const qc = useQueryClient();
  const { data: pending, isLoading } = usePendingSms();
  const categorize = useCategorizeSms();
  const ignore = useIgnoreSms();
  const addItem = useAddBudgetItem();

  const { data: pickerData } = useQuery({
    queryKey: SMS_PICKER_KEY,
    queryFn: loadPickerData,
  });

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Allocate sheet (existing-item flow) + create flow (new item).
  const [allocateTxn, setAllocateTxn] = useState<SmsTransactionRow | null>(null);
  const [createFlow, setCreateFlow] = useState<{
    txn: SmsTransactionRow;
    categoryId: string;
  } | null>(null);

  // Asset/debt link targets for the full item editor (loaded once).
  const [linkTargets, setLinkTargets] = useState<{
    assets: LinkTarget[];
    debts: LinkTarget[];
  }>({ assets: [], debts: [] });

  useEffect(() => {
    const db = getDB();
    let cancelled = false;
    (async () => {
      const [assets, debts] = await Promise.all([
        db.assets.toArray(),
        db.debts.toArray(),
      ]);
      if (cancelled) return;
      const activeAssets = assets.filter((a) => !a.achieved_at);
      setLinkTargets({
        assets: activeAssets.map((a) => ({
          id: a.id,
          name: a.is_goal ? `🎯 ${a.name}` : a.name,
          icon: a.icon,
        })),
        debts: debts.map((d) => ({ id: d.id, name: d.name, icon: d.icon })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Deep link from a notification:
  //   /sms?txn=<id>                         → open allocate sheet
  //   /sms?dedupe=<key>                      → open allocate sheet (find by dedupe)
  //   /sms?dedupe=<key>&item=<id>&apply=1    → one-tap allocate (action button)
  const handledDeepLink = useRef(false);
  useEffect(() => {
    if (handledDeepLink.current) return;
    if (!pending) return;
    const params = new URLSearchParams(window.location.search);
    const txnId = params.get("txn");
    const dedupe = params.get("dedupe");
    const item = params.get("item");
    const apply = params.get("apply") === "1";

    const target = txnId
      ? pending.find((t) => t.id === txnId)
      : dedupe
        ? pending.find((t) => t.dedupe_key === dedupe)
        : undefined;
    if (!target) return;

    handledDeepLink.current = true;
    if (apply && item) {
      // One-tap allocate straight from the notification action button.
      void categorize.mutateAsync({
        txnId: target.id,
        budgetItemId: item,
        rememberRule: true,
      });
      return;
    }
    // Syncing an external deep-link (notification URL) into state on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAllocateTxn(target);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAllocate(budgetItemId: string, remember: boolean) {
    if (!allocateTxn) return;
    await categorize.mutateAsync({
      txnId: allocateTxn.id,
      budgetItemId,
      rememberRule: remember,
    });
    setAllocateTxn(null);
  }

  function handleCreateNew(categoryId: string) {
    const txn = allocateTxn;
    setAllocateTxn(null);
    if (txn) setCreateFlow({ txn, categoryId });
  }

  // Create the new item, then allocate the transaction to it. Routing the
  // spend through categorize (not the item's actual_amount) is what cascades
  // to a linked asset/debt. Thrown errors surface in the ItemDetailSheet.
  async function handleCreateItem(data: {
    name: string;
    planned_amount: number;
    link_type?: "asset" | "debt" | null;
    link_id?: string | null;
  }) {
    if (!createFlow) return;
    const link =
      data.link_type && data.link_id
        ? { link_type: data.link_type, link_id: data.link_id }
        : null;
    const { id: tempId } = await addItem.mutateAsync({
      categoryId: createFlow.categoryId,
      name: data.name,
      planned: data.planned_amount,
      link,
      month,
      year,
    });
    await categorize.mutateAsync({
      txnId: createFlow.txn.id,
      budgetItemId: tempId,
      rememberRule: true,
    });
    qc.invalidateQueries({ queryKey: SMS_PICKER_KEY });
  }

  const createMeta = createFlow
    ? pickerData?.metaById[createFlow.categoryId]
    : undefined;

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
            Transactions
          </h1>
          <p className="text-[11px] font-medium text-muted-foreground mt-1">
            Awaiting allocation{!isLoading && pending ? ` · ${pending.length}` : ""}
          </p>
        </div>
      </div>

      {/* Pending list */}
      <section className="flex flex-col gap-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground px-1">Loading…</p>
        ) : !pending || pending.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-[14px] bg-tile text-muted-foreground mb-1">
              <Inbox size={24} strokeWidth={1.7} />
            </div>
            <p className="text-sm font-bold text-foreground">No unallocated transactions.</p>
            <p className="text-xs text-muted-foreground">
              New transaction SMS will show up here to allocate.
            </p>
          </Card>
        ) : (
          pending.map((txn) => {
            const when = txnDate(txn);
            const meta = [when, txn.direction].filter(Boolean).join(" · ");
            return (
              <Card key={txn.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="figure text-[26px] text-foreground">{money(txn)}</span>
                    <span className="truncate text-[13px] font-bold text-foreground mt-0.5">
                      {txn.merchant_raw ?? "Unknown merchant"}
                    </span>
                  </div>
                  {meta && <Chip tone="neutral">{meta}</Chip>}
                </div>

                <div className="flex gap-2.5 mt-3.5">
                  <button
                    onClick={() => setAllocateTxn(txn)}
                    className="flex-1 h-[42px] rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] text-sm font-bold active:scale-[0.98] transition-transform"
                  >
                    Allocate
                  </button>
                  <button
                    onClick={() => ignore.mutate(txn.id)}
                    className="h-[42px] px-5 rounded-pill border border-border text-sm font-semibold text-muted-foreground active:scale-[0.98] transition-transform"
                  >
                    Ignore
                  </button>
                </div>
              </Card>
            );
          })
        )}

        <p className="text-center text-[11.5px] font-medium text-muted-foreground mt-2">
          Spends from SMS land here for one-tap budgeting.
        </p>
      </section>

      <div className="h-28 md:h-12" />

      {/* Allocate flow — pick an existing item, or jump to create-new */}
      <AllocateSheet
        txn={allocateTxn}
        amountLabel={allocateTxn ? money(allocateTxn) : ""}
        items={pickerData?.items ?? []}
        categories={pickerData?.categories ?? []}
        onAllocate={handleAllocate}
        onCreateNew={handleCreateNew}
        onClose={() => setAllocateTxn(null)}
        isPending={categorize.isPending}
      />

      {/* Create-new item — full editor, scoped to the chosen category */}
      <ItemDetailSheet
        item={
          createFlow && createMeta
            ? {
                id: NEW_ITEM_ID,
                name: createFlow.txn.merchant_raw ?? "",
                planned: 0,
                actual: 0,
                is_completed: false,
                notes: null,
              }
            : null
        }
        category={{
          name: createMeta?.name ?? "",
          icon: createMeta?.icon ?? null,
          type: createMeta?.type ?? null,
          allocation: createMeta?.allocation ?? 0,
          otherItemsPlanned: createMeta?.plannedTotal ?? 0,
        }}
        linkTargets={linkTargets}
        hideActual
        onClose={() => setCreateFlow(null)}
        onCreate={handleCreateItem}
        onSave={async () => {}}
        onDelete={() => {}}
      />
    </div>
  );
}
