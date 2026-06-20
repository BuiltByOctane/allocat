"use client";

import { CurrencyText } from "@/components/ui/CurrencyText";
import { useItemTransactions } from "@/lib/hooks/useSmsTransactions";
import type { SmsTransactionRow } from "@/lib/db";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) +
    " · " +
    d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  );
}

/** When a transaction happened — its own time, falling back to capture time. */
function whenOf(txn: SmsTransactionRow): string {
  return txn.occurred_at ?? txn.created_at;
}

export function ItemTransactionList({ itemId }: { itemId: string }) {
  const { data, isLoading } = useItemTransactions(itemId);

  const txns = data ?? [];

  return (
    <div className="space-y-2">
      <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground block">
        Transactions
      </label>

      {isLoading && txns.length === 0 ? (
        <div className="rounded-tile bg-tile px-4 py-6 text-center text-[11px] font-medium text-muted-foreground">
          Loading…
        </div>
      ) : txns.length === 0 ? (
        <div className="rounded-tile bg-tile px-4 py-6 text-center text-[11px] font-medium text-muted-foreground">
          No transactions yet.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {txns.map((txn) => {
            const title = txn.label || txn.merchant_raw || "Transaction";
            return (
              <div
                key={txn.id}
                className="w-full flex items-center gap-3 rounded-tile bg-tile px-3.5 py-2.5 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12.5px] font-semibold text-foreground leading-snug truncate">
                      {title}
                    </p>
                    <span className="shrink-0 rounded-full bg-card px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-muted-foreground">
                      {txn.source === "manual" ? "Manual" : "SMS"}
                    </span>
                  </div>
                  <p className="text-[10px] font-medium text-muted-foreground tabular-nums mt-0.5">
                    {formatDateTime(whenOf(txn))}
                  </p>
                </div>
                {typeof txn.amount === "number" ? (
                  <span className="figure text-[12.5px] shrink-0">
                    <CurrencyText value={txn.amount} />
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
