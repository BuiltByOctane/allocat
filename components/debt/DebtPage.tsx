"use client";

import { useCallback, useState } from "react";
import { HandCoins } from "lucide-react";
import { DebtDetailSheet } from "./DebtDetailSheet";
import { DebtPaymentSheet } from "./DebtPaymentSheet";
import { ConfirmDrawer } from "@/components/ui/ConfirmDrawer";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useRegisterQuickAction } from "@/lib/providers/QuickActionProvider";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Progress } from "@/components/ui/Progress";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { resolveColor } from "@/lib/theme/dataViz";
import {
  useAddDebt,
  useUpdateDebt,
  useDeleteDebt,
  useUpdateDebtIcon,
  useDebtPaymentTrend,
} from "@/lib/hooks/useDebt";
import LentListView from "./LentListView";
import DebtEmptyState from "./DebtEmptyState";
import EmojiPickerModal from "@/components/ui/EmojiPickerModal";
import { CurrencyText } from "@/components/ui/CurrencyText";

type Debt = {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
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


function monthCaption() {
  const now = new Date();
  return `${now.toLocaleString("en-US", { month: "short" })} ${now.getFullYear()}`;
}

export default function DebtPage({ data }: { data: Debt[] }) {
  const [activeTab, setActiveTab] = useState<"active" | "closed">("active");
  const [showLentList, setShowLentList] = useState(false);
  const [debtToDelete, setDebtToDelete] = useState<string | null>(null);
  const [pickerDebtId, setPickerDebtId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  // Sheet state
  const [sheetMode, setSheetMode] = useState<"add" | "edit">("add");
  const [sheetDebt, setSheetDebt] = useState<Debt | undefined>(undefined);
  const [sheetOpen, setSheetOpen] = useState(false);
  const haptic = useHaptic();

  const addDebtMutation = useAddDebt();
  const updateDebtMutation = useUpdateDebt();
  const deleteDebtMutation = useDeleteDebt();
  const updateDebtIconMutation = useUpdateDebtIcon();
  const { data: trendData } = useDebtPaymentTrend();

  const allActiveDebts = data.filter((d) => !d.isClosed && d.type !== "lent");
  const activeDebts = allActiveDebts;
  const closedDebts = data.filter((d) => d.isClosed && d.type !== "lent");
  const lents = data.filter((d) => d.type === "lent");

  const totalOutstanding = allActiveDebts.reduce(
    (s, d) => s + Math.max(0, d.principal - d.totalPaid), 0
  );

  const totalLent = lents.filter((d) => !d.isClosed).reduce(
    (s, d) => s + Math.max(0, d.principal - d.totalPaid), 0
  );

  // Overall payoff % across all active debts
  const totalPaidAll = allActiveDebts.reduce((s, d) => s + d.totalPaid, 0);
  const totalRepayableAll = allActiveDebts.reduce((s, d) => s + d.principal, 0);
  const overallPct = totalRepayableAll > 0 ? totalPaidAll / totalRepayableAll : 0;

  // Quick payment — all active non-lent debts
  const quickPayDebts = data.filter((d) => !d.isClosed && d.type !== "lent");

  // Quick-action dock: log a debt payment (only when there's something to pay).
  const openPayment = useCallback(() => setPaymentOpen(true), []);
  useRegisterQuickAction(
    quickPayDebts.length > 0
      ? { id: "debt", label: "Make payment", icon: HandCoins, onTrigger: openPayment }
      : null,
  );

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
    principal: number;
    color: string | null;
    totalPaid?: number;
  }) {
    if (sheetMode === "add") {
      addDebtMutation.mutate({
        name: formData.name,
        type: "external",
        principal: formData.principal,
        interestRate: 0,
        monthlyMin: 0,
      });
    } else if (sheetDebt) {
      updateDebtMutation.mutate({
        id: sheetDebt.id,
        updates: {
          name: formData.name,
          principal: formData.principal,
          color: formData.color,
          ...(formData.totalPaid !== undefined ? { total_paid: formData.totalPaid } : {}),
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

  const trendPct = trendData?.trendPct ?? 0;
  const trendLabel = trendPct === 0
    ? "-"
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
        <div className="px-4 pt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between px-1 pt-1">
            <div>
              <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground">
                Debt
              </h1>
              <p className="text-[11px] font-medium text-muted-foreground mt-1">
                Liability tracker · {monthCaption()}
              </p>
            </div>
            <button
              onClick={openAddSheet}
              className="flex size-[38px] items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Add debt"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
            </button>
          </div>
          <DebtEmptyState onAddDebt={openAddSheet} onLent={() => setShowLentList(true)} />
        </div>
        <div className="h-28 md:h-12" />
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
      <div className="px-4 pt-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between px-1 pt-1">
          <div>
            <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground">
              Debt
            </h1>
            <p className="text-[11px] font-medium text-muted-foreground mt-1">
              Liability tracker · {monthCaption()}
            </p>
          </div>
          <button
            onClick={openAddSheet}
            className="flex size-[38px] items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Add debt"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
          </button>
        </div>

        {/* Total outstanding hero (white card) */}
        <Card id="debt-hero-section">
          <div className="flex justify-between items-start">
            <span className="t-label text-muted-foreground">Total outstanding</span>
            {totalRepayableAll > 0 && (
              <Chip tone="good">{overallPct >= 1 ? "Cleared" : "Paying down"}</Chip>
            )}
          </div>
          <div className="figure text-[38px] mt-1.5 mb-3">
            <CurrencyText value={totalOutstanding} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground">
              {allActiveDebts.length} active {allActiveDebts.length === 1 ? "liability" : "liabilities"}
            </span>
          </div>
          {totalRepayableAll > 0 && (
            <div id="debt-progress-ruler" className="mt-3.5">
              <Progress value={overallPct * 100} />
            </div>
          )}
        </Card>

        {/* Tabs */}
        <div id="debt-tabs">
          <SegmentedControl
            variant="pill"
            options={[
              { label: "Active", value: "active", count: allActiveDebts.length },
              { label: "Closed", value: "closed", count: closedDebts.length },
            ]}
            value={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {/* Active / Closed list */}
        {activeTab !== "closed" ? (
          <>
            <div className="flex items-center justify-between px-1">
              <span className="font-display text-[15px] font-bold text-foreground">
                Active debts · {activeDebts.length}
              </span>
            </div>

            {activeDebts.length === 0 && (
              <Card compact>
                <p className="py-4 text-center text-[12px] font-medium text-muted-foreground">
                  No active debts.
                </p>
              </Card>
            )}

            <div className="flex flex-col gap-2.5">
              {activeDebts.map((debt, i) => {
                const repayable = debt.principal;
                const remaining = Math.max(0, repayable - debt.totalPaid);
                const paidPct = repayable > 0 ? debt.totalPaid / repayable : 0;
                const accent = resolveColor({ id: debt.id, color: debt.color });
                return (
                  <Card
                    key={debt.id}
                    id={i === 0 ? "debt-row-0" : undefined}
                    compact
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-1 w-[3px] h-9 rounded-full shrink-0"
                        style={{ background: accent }}
                      />
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => openEditSheet(debt)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                {debt.icon && <span className="text-sm leading-none">{debt.icon}</span>}
                                <span className="text-[14.5px] font-bold text-foreground truncate">
                                  {debt.name}
                                </span>
                              </div>
                              <div className="mt-1 text-[10.5px] font-semibold text-muted-foreground">
                                {Math.round(paidPct * 100)}% paid off
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="figure text-[16px]">
                                <CurrencyText value={remaining} className="text-foreground" />
                              </div>
                              <div className="text-[9.5px] font-semibold text-muted-foreground">remaining</div>
                            </div>
                          </div>
                        </button>
                        <Progress
                          className="mt-2.5 h-1.5"
                          value={Math.min(paidPct, 1) * 100}
                          color={accent}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="px-1">
              <span className="font-display text-[15px] font-bold text-foreground">
                Closed liabilities · {closedDebts.length}
              </span>
            </div>
            {closedDebts.length === 0 && (
              <Card compact>
                <p className="py-4 text-center text-[12px] font-medium text-muted-foreground">
                  No closed liabilities.
                </p>
              </Card>
            )}
            <div className="flex flex-col gap-2.5">
              {closedDebts.map((debt) => (
                <button
                  key={debt.id}
                  onClick={() => openEditSheet(debt)}
                  className="w-full text-left active:scale-[0.99] transition-transform"
                >
                  <Card compact className="flex items-center gap-3 opacity-60">
                    <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-accent-strong text-[var(--accent-ink)]">
                      <span className="material-symbols-outlined text-[15px]">check</span>
                    </span>
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      {debt.icon && <span className="text-sm leading-none">{debt.icon}</span>}
                      <span className="text-[13.5px] font-bold text-foreground truncate">{debt.name}</span>
                    </div>
                    <div className="text-[11px] font-semibold text-muted-foreground inline-flex items-baseline gap-1.5">
                      Paid off
                      <CurrencyText value={debt.principal} />
                    </div>
                  </Card>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Out to friends nav */}
        <button
          onClick={() => { haptic.light(); setShowLentList(true); }}
          className="w-full text-left active:scale-[0.99] transition-transform"
        >
          <Card className="flex items-center justify-between">
            <div>
              <div className="t-label text-muted-foreground">Out to friends</div>
              <div className="figure text-[20px] mt-1 text-foreground">
                {totalLent > 0 ? (
                  <CurrencyText value={totalLent} />
                ) : (
                  <span className="text-[13px] font-semibold text-muted-foreground">No active lends</span>
                )}
              </div>
            </div>
            <span className="text-muted-foreground text-lg">→</span>
          </Card>
        </button>
      </div>

      {/* Sheets & Modals */}
      <DebtPaymentSheet
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        debts={quickPayDebts}
      />

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
