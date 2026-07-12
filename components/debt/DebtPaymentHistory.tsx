"use client";

import { CurrencyText } from "@/components/ui/CurrencyText";
import { useDebtPayments } from "@/lib/hooks/useActivityLogs";

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

/** Per-debt payment log, derived from activity_logs (payments + reversals). */
export function DebtPaymentHistory({ debtId }: { debtId: string }) {
  const { data, isLoading } = useDebtPayments(debtId);
  const logs = data ?? [];

  return (
    <div className="space-y-2">
      <label className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground block">
        Payment history
      </label>

      {isLoading && logs.length === 0 ? (
        <div className="rounded-tile bg-tile px-4 py-6 text-center text-[11px] font-medium text-muted-foreground">
          Loading…
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-tile bg-tile px-4 py-6 text-center text-[11px] font-medium text-muted-foreground">
          No payments yet.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {logs.map((log) => {
            const meta = log.metadata as { amount?: number } | null;
            const amount = Number(meta?.amount) || 0;
            const reversed = log.action_type === "debt_payment_reversed";
            return (
              <div
                key={log.id}
                className="w-full flex items-center gap-3 rounded-tile bg-tile px-3.5 py-2.5 text-left"
              >
                <span
                  className={`material-symbols-outlined shrink-0 text-[18px] ${
                    reversed ? "text-muted-foreground" : "text-[var(--accent-strong)]"
                  }`}
                >
                  {reversed ? "undo" : "payments"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-foreground leading-snug truncate">
                    {reversed ? "Payment reversed" : "Payment"}
                  </p>
                  <p className="text-[10px] font-medium text-muted-foreground tabular-nums mt-0.5">
                    {formatDateTime(log.created_at)}
                  </p>
                </div>
                <span
                  className={`figure text-[12.5px] shrink-0 inline-flex items-baseline gap-0.5 ${
                    reversed ? "text-muted-foreground" : "text-foreground"
                  }`}
                >
                  {reversed ? "−" : "+"}
                  <CurrencyText value={amount} />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
