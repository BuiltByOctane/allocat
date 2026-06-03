"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDB } from "@/lib/db";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { formatCurrency } from "@/lib/number-format";
import {
  usePendingSms,
  useIngestSms,
  useCategorizeSms,
  useIgnoreSms,
} from "@/lib/hooks/useSmsTransactions";
import type { SmsTransactionRow } from "@/lib/db";

interface PickerItem {
  id: string;
  label: string;
}

/** Flat list of budget items for the current month, labelled "Category › Item". */
async function loadBudgetItems(): Promise<PickerItem[]> {
  const db = getDB();
  const now = new Date();
  const budget = await db.budgets
    .where("[month+year]")
    .equals([now.getMonth() + 1, now.getFullYear()])
    .first();
  if (!budget) return [];

  const categories = await db.categories
    .where("budget_id")
    .equals(budget.id)
    .toArray();

  const out: PickerItem[] = [];
  for (const cat of categories) {
    const items = await db.budget_items
      .where("category_id")
      .equals(cat.id)
      .toArray();
    for (const item of items) {
      out.push({ id: item.id, label: `${cat.name} › ${item.name}` });
    }
  }
  return out;
}

function money(row: SmsTransactionRow): string {
  if (typeof row.amount !== "number") return "—";
  return formatCurrency(row.amount, {
    code: row.currency ?? "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function SmsPage() {
  const { data: pending, isLoading } = usePendingSms();
  const ingest = useIngestSms();
  const categorize = useCategorizeSms();
  const ignore = useIgnoreSms();

  const { data: pickerItems } = useQuery({
    queryKey: ["sms-picker"],
    queryFn: loadBudgetItems,
  });

  const [activeTxn, setActiveTxn] = useState<string | null>(null);
  const [chosenItem, setChosenItem] = useState<string>("");
  const [remember, setRemember] = useState(true);

  // Dev harness state
  const [smsText, setSmsText] = useState("");
  const [sender, setSender] = useState("HDFCBK");

  const items = pickerItems ?? [];

  // Deep link from the notification: /sms?txn=<id> → auto-open allocate for it.
  const handledDeepLink = useRef(false);
  useEffect(() => {
    if (handledDeepLink.current) return;
    if (!pending || items.length === 0) return;
    const txnId = new URLSearchParams(window.location.search).get("txn");
    if (!txnId) return;
    if (pending.some((t) => t.id === txnId)) {
      handledDeepLink.current = true;
      startCategorize(txnId);
    }
  }, [pending, items]);

  function startCategorize(txnId: string) {
    setActiveTxn(txnId);
    setChosenItem(items[0]?.id ?? "");
    setRemember(true);
  }

  async function confirmCategorize(txnId: string) {
    if (!chosenItem) return;
    await categorize.mutateAsync({
      txnId,
      budgetItemId: chosenItem,
      rememberRule: remember,
    });
    setActiveTxn(null);
  }

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
          <p className="text-sm text-muted-foreground">
            No unallocated transactions. New transaction SMS will appear here.
          </p>
        ) : (
          pending.map((txn) => (
            <div key={txn.id} className="border border-border p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-base font-bold">
                  {money(txn)}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {txn.merchant_raw ?? "Unknown merchant"}
                </span>
              </div>

              {activeTxn === txn.id ? (
                <div className="mt-3 flex flex-col gap-3">
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No budget items this month. Create a budget first.
                    </p>
                  ) : (
                    <>
                      <select
                        value={chosenItem}
                        onChange={(e) => setChosenItem(e.target.value)}
                        className="border border-border bg-transparent p-2 text-sm"
                      >
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.label}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                        />
                        Remember this merchant for future transactions
                      </label>
                    </>
                  )}
                  <div className="flex gap-2">
                    <button
                      disabled={!chosenItem || categorize.isPending}
                      onClick={() => confirmCategorize(txn.id)}
                      className="flex-1 bg-foreground py-2 text-xs font-bold uppercase tracking-widest text-background disabled:opacity-40"
                    >
                      Allocate
                    </button>
                    <button
                      onClick={() => setActiveTxn(null)}
                      className="border border-border px-3 text-xs font-bold uppercase tracking-widest"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => startCategorize(txn.id)}
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
              )}
            </div>
          ))
        )}
      </section>

      {/* Dev / manual harness — feed a raw SMS through the same pipeline */}
      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Simulate a transaction SMS
        </h2>
        <input
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          placeholder="Sender (e.g. HDFCBK)"
          className="border border-border bg-transparent p-2 text-sm"
        />
        <textarea
          value={smsText}
          onChange={(e) => setSmsText(e.target.value)}
          placeholder="Paste a bank/UPI SMS…"
          rows={3}
          className="border border-border bg-transparent p-2 font-mono text-xs"
        />
        <button
          disabled={!smsText.trim() || ingest.isPending}
          onClick={async () => {
            await ingest.mutateAsync({ raw: smsText, sender });
            setSmsText("");
          }}
          className="bg-foreground py-2 text-xs font-bold uppercase tracking-widest text-background disabled:opacity-40"
        >
          {ingest.isPending ? "Processing…" : "Ingest"}
        </button>
      </section>
    </div>
  );
}
