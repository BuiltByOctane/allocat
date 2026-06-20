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
  useCategorizedSms,
  useDeleteSms,
  useUnallocateSms,
  useRecategorizeSms,
  useReportSmsMistake,
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
        planned: Number(item.planned_amount) || 0,
        actual: Number(item.actual_amount) || 0,
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
  const { data: categorized } = useCategorizedSms();
  const categorize = useCategorizeSms();
  const ignore = useIgnoreSms();
  const del = useDeleteSms();
  const unallocate = useUnallocateSms();
  const recategorize = useRecategorizeSms();
  const report = useReportSmsMistake();
  const addItem = useAddBudgetItem();

  const [tab, setTab] = useState<"pending" | "allocated">("pending");
  // The categorized txn being moved/renamed via the reallocate sheet.
  const [reallocTxn, setReallocTxn] = useState<SmsTransactionRow | null>(null);

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

  // Surfaced when an allocate (from the sheet or a notification deep-link) fails
  // — AllocateSheet doesn't catch rejections itself, so a dead "Allocate" button
  // would otherwise give no feedback. Cleared whenever a flow (re)starts.
  const [allocError, setAllocError] = useState<string | null>(null);

  // Retry-safety for the create-new flow: once an item is created for a given
  // create flow, remember its id so a retry (e.g. after a transient categorize
  // failure) reuses it instead of inserting a duplicate budget item. Keyed by
  // the flow's txn id so a different transaction starts fresh.
  const createdItemRef = useRef<{ flowTxnId: string; itemId: string } | null>(
    null,
  );

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
      // One-tap allocate straight from the notification action button. On
      // failure (e.g. a stale captured txn id), fall back to opening the sheet
      // so the user can retry instead of the tap silently doing nothing.
      const t = target;
      void (async () => {
        try {
          await categorize.mutateAsync({
            txnId: t.id,
            budgetItemId: item,
            rememberRule: true,
          });
        } catch (err) {
          console.error("[SmsPage] deep-link allocate failed:", err);
          setAllocError(
            err instanceof Error ? err.message : "Couldn't allocate. Try again.",
          );
          setAllocateTxn(t);
        }
      })();
      return;
    }
    // Syncing an external deep-link (notification URL) into state on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAllocateTxn(target);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAllocate(
    budgetItemId: string,
    remember: boolean,
    label?: string | null,
    amount?: number,
  ) {
    if (!allocateTxn) return;
    setAllocError(null);
    try {
      await categorize.mutateAsync({
        txnId: allocateTxn.id,
        budgetItemId,
        rememberRule: remember,
        label: label ?? null,
        ...(amount !== undefined ? { amount } : {}),
      });
      setAllocateTxn(null);
    } catch (err) {
      // Keep the sheet open so the user can retry; surface the reason.
      console.error("[SmsPage] allocate failed:", err);
      setAllocError(
        err instanceof Error ? err.message : "Couldn't allocate. Try again.",
      );
    }
  }

  // Move an already-categorized txn to a different item and/or rename it.
  async function handleReallocate(
    budgetItemId: string,
    _remember: boolean,
    label?: string | null,
    amount?: number,
  ) {
    if (!reallocTxn) return;
    setAllocError(null);
    try {
      await recategorize.mutateAsync({
        txnId: reallocTxn.id,
        newBudgetItemId: budgetItemId,
        label: label ?? null,
        ...(amount !== undefined ? { amount } : {}),
      });
      setReallocTxn(null);
    } catch (err) {
      console.error("[SmsPage] reallocate failed:", err);
      setAllocError(
        err instanceof Error ? err.message : "Couldn't update. Try again.",
      );
    }
  }

  async function handleDelete(txn: SmsTransactionRow) {
    if (!window.confirm("Delete this transaction? Its amount will be removed from the budget.")) return;
    setAllocError(null);
    try {
      await del.mutateAsync(txn.id);
    } catch (err) {
      console.error("[SmsPage] delete failed:", err);
      setAllocError(err instanceof Error ? err.message : "Couldn't delete. Try again.");
    }
  }

  async function handleReport(txn: SmsTransactionRow) {
    if (!window.confirm("Stop tracking this kind of SMS?")) return;
    setAllocError(null);
    try {
      await report.mutateAsync(txn.id);
    } catch (err) {
      console.error("[SmsPage] report failed:", err);
      setAllocError(err instanceof Error ? err.message : "Couldn't update. Try again.");
    }
  }

  function handleCreateNew(categoryId: string) {
    const txn = allocateTxn;
    setAllocateTxn(null);
    setAllocError(null);
    // Fresh flow → drop any item memo from a previous create flow.
    createdItemRef.current = null;
    if (txn) setCreateFlow({ txn, categoryId });
  }

  // Create the new item, then allocate the transaction to it. Routing the
  // spend through categorize (not the item's actual_amount) is what cascades
  // to a linked asset/debt. Thrown errors surface in the ItemDetailSheet.
  //
  // Retry-safe: the item is created at most once per create flow. If a retry
  // reaches here (e.g. the first categorize failed), we reuse the already-created
  // item id instead of inserting a duplicate. categorize itself resolves a stale
  // (temp→real rewritten) txn id, so the happy path now allocates exactly once.
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

    const memo = createdItemRef.current;
    let itemId: string;
    if (memo && memo.flowTxnId === createFlow.txn.id) {
      itemId = memo.itemId;
    } else {
      const created = await addItem.mutateAsync({
        categoryId: createFlow.categoryId,
        name: data.name,
        planned: data.planned_amount,
        link,
        month,
        year,
      });
      itemId = created.id;
      createdItemRef.current = { flowTxnId: createFlow.txn.id, itemId };
    }

    // If categorize throws, the memo above survives so a retry reuses the item.
    await categorize.mutateAsync({
      txnId: createFlow.txn.id,
      budgetItemId: itemId,
      rememberRule: true,
    });

    // Allocated successfully — drop the memo so a later flow can't reuse a stale
    // id. ItemDetailSheet closes itself (calls onClose → setCreateFlow(null)).
    qc.invalidateQueries({ queryKey: SMS_PICKER_KEY });
    createdItemRef.current = null;
  }

  const createMeta = createFlow
    ? pickerData?.metaById[createFlow.categoryId]
    : undefined;

  // Resolve an allocated txn's budget item for the Allocated tab grouping.
  const itemMetaById = new Map(
    (pickerData?.items ?? []).map((i) => [i.id, i] as const),
  );
  // Group categorized txns by budget item, preserving newest-first order.
  const allocatedGroups: Array<{ itemId: string; item?: AllocatePickerItem; txns: SmsTransactionRow[] }> = [];
  {
    const index = new Map<string, number>();
    for (const t of categorized ?? []) {
      const key = t.budget_item_id ?? "__unknown__";
      let pos = index.get(key);
      if (pos === undefined) {
        pos = allocatedGroups.length;
        index.set(key, pos);
        allocatedGroups.push({ itemId: key, item: itemMetaById.get(key), txns: [] });
      }
      allocatedGroups[pos].txns.push(t);
    }
  }

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
            {tab === "pending"
              ? `Awaiting allocation${!isLoading && pending ? ` · ${pending.length}` : ""}`
              : `Allocated${categorized ? ` · ${categorized.length}` : ""}`}
          </p>
        </div>
      </div>

      {/* Pending / Allocated tabs */}
      <div className="flex gap-1 rounded-pill border border-border bg-card p-1">
        {(["pending", "allocated"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 h-9 rounded-pill text-[13px] font-bold capitalize transition-colors ${
              tab === t
                ? "bg-[var(--pill)] text-[var(--pill-foreground)]"
                : "text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Allocate failure (e.g. a stale notification deep-link) */}
      {allocError ? (
        <p
          role="alert"
          className="rounded-xl border border-neg/30 bg-neg/10 px-3 py-2 text-xs font-medium text-neg"
        >
          {allocError}
        </p>
      ) : null}

      {/* Pending list */}
      {tab === "pending" && (
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

                <div className="flex flex-wrap gap-2.5 mt-3.5">
                  <button
                    onClick={() => {
                      setAllocError(null);
                      setAllocateTxn(txn);
                    }}
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
                  <button
                    onClick={() => handleReport(txn)}
                    disabled={report.isPending}
                    className="h-[42px] px-5 rounded-pill border border-neg/30 text-sm font-semibold text-neg active:scale-[0.98] transition-transform"
                  >
                    Not a transaction
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
      )}

      {/* Allocated list — grouped by budget item, with edit/unallocate/delete */}
      {tab === "allocated" && (
        <section className="flex flex-col gap-3">
          {!categorized || categorized.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-[14px] bg-tile text-muted-foreground mb-1">
                <Inbox size={24} strokeWidth={1.7} />
              </div>
              <p className="text-sm font-bold text-foreground">No allocated transactions yet.</p>
              <p className="text-xs text-muted-foreground">
                Allocated SMS spends and where they landed show up here.
              </p>
            </Card>
          ) : (
            allocatedGroups.map((group) => (
              <Card key={group.itemId} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  {group.item?.icon && (
                    <span className="text-lg leading-none shrink-0">{group.item.icon}</span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-foreground">
                      {group.item?.itemName ?? "Unknown / deleted item"}
                    </p>
                    {group.item?.categoryName && (
                      <p className="text-[11px] text-muted-foreground">{group.item.categoryName}</p>
                    )}
                  </div>
                </div>

                {group.txns.map((txn) => {
                  const when = txnDate(txn);
                  return (
                    <div key={txn.id} className="flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-bold text-foreground">
                            {txn.label || txn.merchant_raw || "Unknown"}
                          </span>
                          {when && (
                            <span className="text-[11px] text-muted-foreground mt-0.5">{when}</span>
                          )}
                        </div>
                        <span className="figure text-[17px] text-foreground shrink-0">{money(txn)}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setAllocError(null);
                            setReallocTxn(txn);
                          }}
                          className="h-8 px-3 rounded-pill border border-border text-xs font-semibold text-foreground active:scale-[0.98] transition-transform"
                        >
                          Edit / Move
                        </button>
                        <button
                          onClick={() => unallocate.mutate(txn.id)}
                          className="h-8 px-3 rounded-pill border border-border text-xs font-semibold text-muted-foreground active:scale-[0.98] transition-transform"
                        >
                          Unallocate
                        </button>
                        <button
                          onClick={() => handleDelete(txn)}
                          className="h-8 px-3 rounded-pill border border-neg/30 text-xs font-semibold text-neg active:scale-[0.98] transition-transform"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => handleReport(txn)}
                          disabled={report.isPending}
                          className="h-8 px-3 rounded-pill border border-neg/30 text-xs font-semibold text-neg active:scale-[0.98] transition-transform"
                        >
                          Not a transaction
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Card>
            ))
          )}
        </section>
      )}

      <div className="h-28 md:h-12" />

      {/* Allocate flow — pick an existing item, or jump to create-new */}
      <AllocateSheet
        txn={allocateTxn}
        amountLabel={allocateTxn ? money(allocateTxn) : ""}
        amount={allocateTxn && typeof allocateTxn.amount === "number" ? allocateTxn.amount : null}
        items={pickerData?.items ?? []}
        categories={pickerData?.categories ?? []}
        onAllocate={handleAllocate}
        onCreateNew={handleCreateNew}
        onClose={() => setAllocateTxn(null)}
        isPending={categorize.isPending}
      />

      {/* Reallocate flow — move/rename an already-allocated txn */}
      <AllocateSheet
        txn={reallocTxn}
        amountLabel={reallocTxn ? money(reallocTxn) : ""}
        amount={reallocTxn && typeof reallocTxn.amount === "number" ? reallocTxn.amount : null}
        items={pickerData?.items ?? []}
        categories={pickerData?.categories ?? []}
        onAllocate={handleReallocate}
        onCreateNew={() => {}}
        onClose={() => setReallocTxn(null)}
        isPending={recategorize.isPending}
        mode="reallocate"
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
        onClose={() => {
          // Abandoning (or finishing) the flow drops the create-item memo.
          createdItemRef.current = null;
          setCreateFlow(null);
        }}
        onCreate={handleCreateItem}
        onSave={async () => {}}
        onDelete={() => {}}
      />
    </div>
  );
}
