"use client";

import { useState } from "react";
import { CurrencyText } from "@/components/ui/CurrencyText";
import ActivityDetailSheet from "@/components/activity/ActivityDetailSheet";
import { useItemActivity } from "@/lib/hooks/useActivityLogs";
import type { ActivityLogRow } from "@/lib/db";

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

/** Pull the most relevant money figure out of a log's metadata, if any. */
function amountOf(log: ActivityLogRow): number | null {
  const m = (log.metadata ?? {}) as Record<string, unknown>;
  for (const key of ["actual_amount", "amount", "planned_amount"]) {
    const v = m[key];
    if (typeof v === "number") return v;
  }
  return null;
}

export function ItemTransactionList({ itemId }: { itemId: string }) {
  const { data, isLoading } = useItemActivity(itemId, true);
  const [selected, setSelected] = useState<ActivityLogRow | null>(null);

  const logs = data ?? [];

  return (
    <div className="space-y-2">
      <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground block">
        Transactions
      </label>

      {isLoading && logs.length === 0 ? (
        <div className="rounded-tile bg-tile px-4 py-6 text-center text-[11px] font-medium text-muted-foreground">
          Loading…
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-tile bg-tile px-4 py-6 text-center text-[11px] font-medium text-muted-foreground">
          No transactions yet.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {logs.map((log) => {
            const amt = amountOf(log);
            return (
              <button
                key={log.id}
                type="button"
                onClick={() => setSelected(log)}
                className="w-full flex items-center gap-3 rounded-tile bg-tile px-3.5 py-2.5 text-left transition-colors active:scale-[0.99]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-foreground leading-snug truncate">
                    {log.title}
                  </p>
                  <p className="text-[10px] font-medium text-muted-foreground tabular-nums mt-0.5">
                    {formatDateTime(log.created_at)}
                  </p>
                </div>
                {amt !== null ? (
                  <span className="figure text-[12.5px] shrink-0">
                    <CurrencyText value={amt} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <ActivityDetailSheet
        log={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
