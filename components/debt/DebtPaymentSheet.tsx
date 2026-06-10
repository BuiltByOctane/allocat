"use client";

import { Drawer } from "vaul";
import { useEffect, useState } from "react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useMakePayment } from "@/lib/hooks/useDebt";
import { useFormatCurrency } from "@/lib/hooks/useFormatCurrency";
import { BottomSheetSelect } from "@/components/ui/BottomSheetSelect";
import { CurrencySymbol } from "@/components/ui/CurrencySymbol";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { Button } from "@/components/ui/Button";

type PayableDebt = {
  id: string;
  name: string;
  icon?: string | null;
  principal: number;
  totalPaid: number;
  totalRepayable: number;
};

interface DebtPaymentSheetProps {
  open: boolean;
  onClose: () => void;
  debts: PayableDebt[];
}

export function DebtPaymentSheet({ open, onClose, debts }: DebtPaymentSheetProps) {
  const fmtCurrency = useFormatCurrency();
  const haptic = useHaptic();
  const makePaymentMutation = useMakePayment();
  const [paymentDebtId, setPaymentDebtId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");

  // On open: reset the amount and default the debt to the first payable one.
  useEffect(() => {
    if (!open) return;
    setPaymentAmount("");
    if (debts.length > 0 && !debts.find((d) => d.id === paymentDebtId)) {
      setPaymentDebtId(debts[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleMakePayment() {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0 || !paymentDebtId) return;
    haptic.success();
    makePaymentMutation.mutate(
      { id: paymentDebtId, amount },
      {
        onSuccess: () => {
          setPaymentAmount("");
          onClose();
        },
      },
    );
  }

  const sel = debts.find((d) => d.id === paymentDebtId);

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content
          aria-describedby="debt-payment-description"
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card focus:outline-none max-h-[90dvh]"
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-9 h-1 bg-border rounded-full" />
          </div>

          <div className="overflow-y-auto flex-1 px-6 pt-2 pb-8 space-y-4">
            <div>
              <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground">
                Quick payment
              </Drawer.Title>
              <p id="debt-payment-description" className="text-[13px] text-muted-foreground mt-1">
                Log a payment toward a debt without opening its sheet.
              </p>
            </div>

            {/* Debt picker */}
            <BottomSheetSelect
              title="Select Debt"
              options={debts.map((d) => {
                const repayable = d.totalRepayable > 0 ? d.totalRepayable : d.principal;
                const remaining = Math.max(0, repayable - d.totalPaid);
                return {
                  value: d.id,
                  label: d.name,
                  description: fmtCurrency(remaining) + " remaining",
                  icon: d.icon ?? undefined,
                };
              })}
              value={paymentDebtId}
              onChange={setPaymentDebtId}
              className="flex items-center justify-between rounded-[13px] border border-border bg-card px-3.5 py-3 text-sm font-semibold text-foreground"
            />

            {/* Selected debt remaining */}
            {sel && (() => {
              const repayable = sel.totalRepayable > 0 ? sel.totalRepayable : sel.principal;
              const remaining = Math.max(0, repayable - sel.totalPaid);
              const paidPct = repayable > 0 ? sel.totalPaid / repayable : 0;
              return (
                <div className="text-[11px] font-semibold text-muted-foreground">
                  {Math.round(paidPct * 100)}% paid · remaining{" "}
                  <span className="text-foreground"><CurrencyText value={remaining} /></span>
                </div>
              );
            })()}

            {/* Amount + action */}
            <div className="flex items-center gap-2.5">
              <div className="flex flex-1 items-baseline gap-1.5 rounded-[13px] border border-border bg-card px-3.5 py-3">
                <span className="currency-symbol text-muted-foreground" style={{ fontSize: "18px" }}><CurrencySymbol /></span>
                <input
                  type="number"
                  min="0"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0"
                  className="figure w-full bg-transparent border-none outline-none text-[20px] text-foreground p-0 placeholder:text-muted-foreground"
                />
              </div>
              <Button
                variant="primary"
                onClick={handleMakePayment}
                disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
              >
                Mark paid →
              </Button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
