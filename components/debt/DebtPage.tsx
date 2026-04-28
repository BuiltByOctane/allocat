"use client";

import { useState, useEffect } from "react";
import { DebtDetailSheet } from "./DebtDetailSheet";
import { ConfirmDrawer } from "@/components/ui/ConfirmDrawer";
import { useHaptic } from "@/lib/hooks/useHaptic";
import {
  useAddDebt,
  useUpdateDebt,
  useDeleteDebt,
  useMakePayment,
  useUpdateDebtIcon,
  useDebtPaymentTrend,
} from "@/lib/hooks/useDebt";
import LentListView from "./LentListView";
import DebtEmptyState from "./DebtEmptyState";
import EmojiPickerModal from "@/components/ui/EmojiPickerModal";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { BottomSheetSelect } from "@/components/ui/BottomSheetSelect";

type Debt = {
  id: string;
  name: string;
  icon?: string | null;
  type: "internal" | "external" | "lent";
  principal: number;
  interestRate: number;
  monthlyMin: number;
  totalPaid: number;
  expectedPayoffDate?: string | null;
  isClosed: boolean;
  interestType: "flat" | "diminishing";
  loanTenureMonths: number | null;
  totalRepayable: number;
};


function MonthCaption() {
  const now = new Date();
  return (
    <span>
      {now.toLocaleString("en-US", { month: "short" })} {now.getFullYear()}
    </span>
  );
}

// 41-tick ruler — exact same pattern as BudgetPage TickRuler
function TickRuler({ pct }: { pct: number }) {
  const count = 41;
  return (
    <div>
      <div className="relative h-[18px]">
        <div className="absolute inset-0 flex justify-between items-end">
          {Array.from({ length: count }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 1,
                height: i % 10 === 0 ? 14 : i % 5 === 0 ? 9 : 5,
                background: i / (count - 1) <= pct ? "var(--foreground)" : "var(--progress-empty)",
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-between mt-1.5">
        {["0", "25%", "50%", "75%", "paid"].map((l) => (
          <span key={l} className="font-mono text-[9px] text-foreground/30 tracking-[0.08em]">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// 20-segment dash bar per debt — matches budget SegBar style
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

export default function DebtPage({ data }: { data: Debt[] }) {
  const [activeTab, setActiveTab] = useState<"internal" | "external" | "closed">("external");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDebtId, setPaymentDebtId] = useState("");
  const [showLentList, setShowLentList] = useState(false);
  const [debtToDelete, setDebtToDelete] = useState<string | null>(null);
  const [pickerDebtId, setPickerDebtId] = useState<string | null>(null);
  // Sheet state
  const [sheetMode, setSheetMode] = useState<"add" | "edit">("add");
  const [sheetDebt, setSheetDebt] = useState<Debt | undefined>(undefined);
  const [sheetOpen, setSheetOpen] = useState(false);
  const haptic = useHaptic();

  const addDebtMutation = useAddDebt();
  const updateDebtMutation = useUpdateDebt();
  const deleteDebtMutation = useDeleteDebt();
  const makePaymentMutation = useMakePayment();
  const updateDebtIconMutation = useUpdateDebtIcon();
  const { data: trendData } = useDebtPaymentTrend();

  const allActiveDebts = data.filter((d) => !d.isClosed && d.type !== "lent");
  const activeDebts = allActiveDebts.filter((d) => d.type === activeTab);
  const closedDebts = data.filter((d) => d.isClosed && d.type !== "lent");
  const lents = data.filter((d) => d.type === "lent");

  const totalOutstanding = allActiveDebts.reduce((s, d) => {
    const repayable = d.totalRepayable > 0 ? d.totalRepayable : d.principal;
    return s + Math.max(0, repayable - d.totalPaid);
  }, 0);

  const totalLent = lents.filter((d) => !d.isClosed).reduce(
    (s, d) => s + Math.max(0, d.principal - d.totalPaid), 0
  );

  const avgInterest =
    allActiveDebts.filter((d) => d.interestRate > 0).reduce((s, d) => s + d.interestRate, 0) /
    (allActiveDebts.filter((d) => d.interestRate > 0).length || 1);

  // Overall payoff % across all active debts
  const totalPaidAll = allActiveDebts.reduce((s, d) => s + d.totalPaid, 0);
  const totalRepayableAll = allActiveDebts.reduce((s, d) => {
    return s + (d.totalRepayable > 0 ? d.totalRepayable : d.principal);
  }, 0);
  const overallPct = totalRepayableAll > 0 ? totalPaidAll / totalRepayableAll : 0;

  // Quick payment — all active non-lent debts
  const quickPayDebts = data.filter((d) => !d.isClosed && d.type !== "lent");

  useEffect(() => {
    if (quickPayDebts.length > 0 && !quickPayDebts.find((d) => d.id === paymentDebtId)) {
      setPaymentDebtId(quickPayDebts[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.length]);

  function openAddSheet() {
    setSheetMode("add");
    setSheetDebt(undefined);
    setSheetOpen(true);
  }

  function openEditSheet(debt: Debt) {
    setSheetMode("edit");
    setSheetDebt(debt);
    setSheetOpen(true);
  }

  function handleSheetSave(formData: {
    name: string;
    type: "internal" | "external";
    principal: number;
    interestRate: number;
    monthlyMin: number;
    interestType: "flat" | "diminishing";
    loanTenureMonths: number | null;
    totalRepayable: number;
  }) {
    if (sheetMode === "add") {
      addDebtMutation.mutate({
        name: formData.name,
        type: formData.type,
        principal: formData.principal,
        interestRate: formData.interestRate,
        monthlyMin: formData.monthlyMin,
        interestType: formData.interestType,
        loanTenureMonths: formData.loanTenureMonths,
      });
    } else if (sheetDebt) {
      updateDebtMutation.mutate({
        id: sheetDebt.id,
        updates: {
          name: formData.name,
          type: formData.type,
          principal: formData.principal,
          interest_rate: formData.interestRate,
          monthly_minimum: formData.monthlyMin,
          interest_type: formData.interestType,
          loan_tenure_months: formData.loanTenureMonths,
          total_repayable: formData.totalRepayable,
        },
      });
    }
  }

  function handleCloseDebt(id: string, shouldClose: boolean) {
    updateDebtMutation.mutate({ id, updates: { is_closed: shouldClose } });
  }

  function handleDeleteDebt(id: string) {
    setDebtToDelete(id);
  }

  function handleMakePayment() {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0 || !paymentDebtId) return;
    haptic.success();
    makePaymentMutation.mutate(
      { id: paymentDebtId, amount },
      { onSuccess: () => setPaymentAmount("") }
    );
  }

const trendPct = trendData?.trendPct ?? 0;
  const trendLabel = trendPct === 0
    ? "—"
    : `${trendPct >= 0 ? "↘" : "↗"} ${Math.abs(trendPct).toFixed(1)}%`;

  const hasDebts = data.filter((d) => d.type !== "lent").length > 0;
  const hasLents = lents.length > 0;

  if (showLentList) {
    return (
      <LentListView lents={lents} onBack={() => setShowLentList(false)} />
    );
  }

  if (!hasDebts && !hasLents) {
    return (
      <>
        <header className="px-7 pt-14 pb-[18px] border-b border-border">
          <div className="font-display text-[32px] leading-none tracking-[-0.02em] text-foreground">Debt</div>
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mt-2">
            Liability Tracker · <MonthCaption />
          </div>
        </header>
        <main className="px-4 pb-6">
          <DebtEmptyState onAddDebt={openAddSheet} />
        </main>
        <DebtDetailSheet
          mode="add"
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onSave={handleSheetSave}
        />
      </>
    );
  }

  return (
    <>
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="px-7 pt-6 pb-[18px] border-b border-border">
        <div className="font-display text-[32px] leading-none tracking-[-0.02em] text-foreground">Debt</div>
        <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mt-2">
          Liability Tracker · <MonthCaption />
        </div>
      </header>

      <main className="pb-10">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <div id="debt-hero-section" className="px-7 pt-7 pb-6">
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2">
            Total Outstanding · <MonthCaption />
          </div>
          <CurrencyText value={totalOutstanding} className="font-display text-[52px] leading-[0.95] tracking-[-0.025em] text-foreground" />
          <div className="flex items-baseline gap-4 mt-3">
            <span className="font-mono text-[11px] text-muted-foreground">
              ↳ {allActiveDebts.length} active {allActiveDebts.length === 1 ? "liability" : "liabilities"}
            </span>
            {(hasLents || totalLent > 0) && (
              <button
                onClick={() => { haptic.light(); setShowLentList(true); }}
                className="font-mono text-[11px] text-foreground underline underline-offset-2 decoration-foreground/30 hover:decoration-foreground transition-all inline-flex items-baseline gap-1"
              >
                · money out <CurrencyText value={totalLent} /> →
              </button>
            )}
          </div>
        </div>

        <div className="h-px bg-border mx-7" />

        {/* ── Sub-stats ─────────────────────────────────────────────── */}
        <div className="px-7 py-5 flex justify-between items-baseline bg-card">
          <div>
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-1">Avg Interest</div>
            <div className="font-display text-[34px] leading-none tracking-[-0.02em] tabular-nums text-foreground">
              {avgInterest.toFixed(1)}<span className="text-[20px] text-muted-foreground">%</span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-1">Payoff Trend</div>
            <div className="font-mono text-[14px] tabular-nums text-foreground">{trendLabel}</div>
            <div className="font-mono text-[9px] text-muted-foreground mt-0.5">30-day · vs outstanding</div>
          </div>
        </div>

        {/* Tick ruler */}
        {totalRepayableAll > 0 && (
          <div id="debt-progress-ruler" className="px-7 pb-6 bg-card">
            <TickRuler pct={overallPct} />
          </div>
        )}

        <div className="h-px bg-border mx-7" />

        {/* ── Quick Payment ─────────────────────────────────────────── */}
        {quickPayDebts.length > 0 && (
          <div className="bg-card">
            <div id="debt-quick-section" className="px-7 pt-5 pb-1 flex justify-between items-baseline bg-card">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                Quick Payment
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">Step 01</span>
            </div>

            <div className="px-7">
              {/* Debt picker */}
              <div className="py-2 border-t border-border">
                <BottomSheetSelect
                  title="Select Debt"
                  options={quickPayDebts.map((d) => {
                    const repayable = d.totalRepayable > 0 ? d.totalRepayable : d.principal;
                    const remaining = Math.max(0, repayable - d.totalPaid);
                    return {
                      value: d.id,
                      label: d.name,
                      description: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 }).format(remaining) + " remaining",
                      icon: d.icon ?? undefined,
                    };
                  })}
                  value={paymentDebtId}
                  onChange={setPaymentDebtId}
                />
              </div>

              {/* Selected debt remaining */}
              {(() => {
                const sel = quickPayDebts.find((d) => d.id === paymentDebtId);
                if (!sel) return null;
                const repayable = sel.totalRepayable > 0 ? sel.totalRepayable : sel.principal;
                const remaining = Math.max(0, repayable - sel.totalPaid);
                const paidPct = repayable > 0 ? sel.totalPaid / repayable : 0;
                return (
                  <div className="py-2 border-t border-border flex items-baseline justify-between">
                    <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground">
                      {Math.round(paidPct * 100)}% paid · remaining
                    </span>
                    <CurrencyText value={remaining} className="font-mono text-[13px] text-foreground" />
                  </div>
                );
              })()}

              {/* Amount + action */}
              <div className="flex items-baseline justify-between py-4 border-t border-border border-b border-b-border">
                <div className="flex items-baseline gap-1.5">
                  <span className="currency-symbol font-sans text-foreground/30" style={{ fontSize: "calc(0.62 * 28px)" }}>₹</span>
                  <input
                    type="number"
                    min="0"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="0"
                    className="bg-transparent border-none outline-none font-display text-[28px] tracking-[-0.02em] text-foreground w-36 p-0 tabular-nums placeholder:text-foreground/30"
                  />
                </div>
                <button
                  onClick={handleMakePayment}
                  disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
                  className="px-4 py-3 bg-foreground text-background font-mono text-[10px] tracking-[0.14em] uppercase disabled:opacity-30 active:scale-95 transition-all"
                >
                  Mark Paid →
                </button>
              </div>
            </div>

            <div className="h-px bg-border mx-7 mt-1" />
          </div>
        )}

        {/* ── Tabs ─────────────────────────────────────────────────── */}
        <div id="debt-tabs" className="px-7 pt-5 pb-1 flex gap-5">
          {([
            { key: "internal", count: allActiveDebts.filter((d) => d.type === "internal").length, label: "Internal" },
            { key: "external", count: allActiveDebts.filter((d) => d.type === "external").length, label: "External" },
            { key: "closed", count: closedDebts.length, label: "Closed" },
          ] as const).map(({ key, count, label }) => (
            <button
              key={key}
              onClick={() => { haptic.light(); setActiveTab(key); }}
              className={`font-mono text-[10px] tracking-[0.14em] uppercase pb-1 transition-colors ${
                activeTab === key
                  ? "text-foreground border-b border-foreground"
                  : "text-muted-foreground border-b border-transparent hover:text-foreground"
              }`}
            >
              {label} · {count}
            </button>
          ))}
        </div>

        {/* ── Active Debts ──────────────────────────────────────────── */}
        {activeTab !== "closed" ? (
          <>
            <div className="px-7 pt-4 pb-2 flex justify-between items-baseline">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                Active Debts · {activeDebts.length}
              </span>
              <button
                onClick={openAddSheet}
                className="font-mono text-[10px] tracking-[0.14em] uppercase text-foreground underline underline-offset-2 decoration-foreground/30 hover:decoration-foreground transition-all"
              >
                + New
              </button>
            </div>

            <div className="px-7">
              {activeDebts.length === 0 && (
                <div className="py-8 text-center">
                  <p className="font-mono text-[11px] text-muted-foreground">No {activeTab} debts.</p>
                </div>
              )}

              {activeDebts.map((debt, i) => {
                const repayable = debt.totalRepayable > 0 ? debt.totalRepayable : debt.principal;
                const remaining = Math.max(0, repayable - debt.totalPaid);
                const paidPct = repayable > 0 ? debt.totalPaid / repayable : 0;
                return (
                  <button
                    key={debt.id}
                    id={i === 0 ? "debt-row-0" : undefined}
                    onClick={() => openEditSheet(debt)}
                    className="w-full text-left py-3.5 border-t border-border last:border-b last:border-b-border group"
                  >
                    <div className="flex justify-between items-baseline">
                      <div className="flex items-baseline gap-2.5">
                        <span className="font-mono text-[10px] text-foreground/30">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {debt.icon && (
                          <span className="grayscale text-sm leading-none">{debt.icon}</span>
                        )}
                        <span className="text-[17px] font-semibold tracking-tight text-foreground leading-none">
                          {debt.name}
                        </span>
                        {debt.interestRate > 0 && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            · {debt.interestRate}%
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[12px] text-right inline-flex items-baseline gap-1">
                        <CurrencyText value={remaining} className="text-foreground" />
                        {repayable !== debt.principal && (
                          <span className="text-muted-foreground inline-flex items-baseline gap-0.5">/ <CurrencyText value={repayable} className="text-muted-foreground" /></span>
                        )}
                      </div>
                    </div>
                    <SegBar pct={paidPct} />
                    <div className="flex justify-between mt-1.5">
                      <span className="font-mono text-[9px] text-muted-foreground tracking-[0.08em] uppercase">
                        {Math.round(paidPct * 100)}% paid off
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground tracking-[0.08em] uppercase inline-flex items-baseline gap-1 flex-wrap">
                        {debt.monthlyMin > 0 && <><span>min</span> <CurrencyText value={debt.monthlyMin} /> <span>·</span></>}
                        <span>remaining</span> <CurrencyText value={remaining} />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="px-7 pt-4 pb-2">
              <button
                onClick={openAddSheet}
                className="w-full py-3.5 bg-foreground text-background font-mono text-[10px] tracking-[0.14em] uppercase active:scale-[0.98] transition-all"
              >
                + New Debt
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-7 pt-4 pb-2">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                Closed Liabilities · {closedDebts.length}
              </span>
            </div>
            <div className="px-7">
              {closedDebts.length === 0 && (
                <div className="py-8 text-center">
                  <p className="font-mono text-[11px] text-muted-foreground">No closed liabilities.</p>
                </div>
              )}
              {closedDebts.map((debt, i) => (
                <button
                  key={debt.id}
                  onClick={() => openEditSheet(debt)}
                  className="w-full text-left py-3.5 border-t border-border last:border-b last:border-b-border opacity-40 hover:opacity-60 transition-opacity"
                >
                  <div className="flex justify-between items-baseline">
                    <div className="flex items-baseline gap-2.5">
                      <span className="font-mono text-[10px] text-foreground/30">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {debt.icon && (
                        <span className="grayscale text-sm leading-none">{debt.icon}</span>
                      )}
                      <span className="text-[15px] font-semibold tracking-tight text-foreground">
                        {debt.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-muted-foreground tracking-[0.08em] uppercase">✓ Paid Off</span>
                      <CurrencyText value={debt.totalRepayable > 0 ? debt.totalRepayable : debt.principal} className="font-mono text-[11px] text-muted-foreground" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </main>

      {/* ── Sheets & Modals ───────────────────────────────────────── */}
      <DebtDetailSheet
        mode={sheetMode}
        debt={sheetDebt}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={handleSheetSave}
        onCloseDebt={handleCloseDebt}
        onDelete={handleDeleteDebt}
      />

      <EmojiPickerModal
        isOpen={pickerDebtId !== null}
        onClose={() => setPickerDebtId(null)}
        onSelect={(emoji) => {
          if (pickerDebtId) updateDebtIconMutation.mutate({ id: pickerDebtId, icon: emoji });
        }}
      />

      <ConfirmDrawer
        isOpen={debtToDelete !== null}
        onClose={() => setDebtToDelete(null)}
        onConfirm={() => {
          if (debtToDelete) {
            deleteDebtMutation.mutate(debtToDelete);
            setDebtToDelete(null);
          }
        }}
        title="Delete Debt"
        description="This debt record will be permanently deleted. This action cannot be undone."
        confirmText="Delete"
      />
    </>
  );
}
