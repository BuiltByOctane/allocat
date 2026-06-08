"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDB } from "@/lib/db";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
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
    <div className="flex flex-col gap-6 p-4 pb-24">
      <header className="flex items-center gap-2">
        <MaterialSymbol icon="sms" className="text-foreground" />
        <h1 className="text-lg font-bold uppercase tracking-widest">
          Transactions
        </h1>
      </header>

      {/* Pending list */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Awaiting allocation
        </h2>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !pending || pending.length === 0 ? (
          <div className="flex flex-col items-center gap-2 border border-dashed border-border py-12 text-center">
            <MaterialSymbol
              icon="inbox"
              className="text-3xl text-muted-foreground/60"
            />
            <p className="text-sm text-muted-foreground">
              No unallocated transactions.
            </p>
            <p className="text-xs text-muted-foreground/70">
              New transaction SMS will show up here to allocate.
            </p>
          </div>
        ) : (
          pending.map((txn) => {
            const when = txnDate(txn);
            return (
              <div
                key={txn.id}
                className="flex flex-col gap-3 border border-border p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-mono text-lg font-bold tabular-nums">
                      {money(txn)}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      {txn.merchant_raw ?? "Unknown merchant"}
                    </span>
                  </div>
                  {(when || txn.direction) && (
                    <span className="shrink-0 text-right text-[10px] uppercase tracking-widest text-muted-foreground/70">
                      {when}
                      {when && txn.direction ? " · " : ""}
                      {txn.direction}
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setAllocateTxn(txn)}
                    className="flex-1 bg-foreground py-2 text-xs font-bold uppercase tracking-widest text-background"
                  >
                    Allocate
                  </button>
                  <button
                    onClick={() => ignore.mutate(txn.id)}
                    className="border border-border px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground"
                  >
                    Ignore
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

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
