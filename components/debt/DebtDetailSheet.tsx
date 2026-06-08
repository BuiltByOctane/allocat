"use client";

import { Drawer } from "vaul";
import { useEffect, useRef, useState } from "react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { BottomSheetSelect } from "@/components/ui/BottomSheetSelect";
import { ColorPicker } from "@/components/ui/ColorPicker";
import type { CatKey } from "@/lib/theme/dataViz";
import { calcTotalRepayable, calcEMI } from "@/lib/utils/debt-calc";
import { CurrencyText } from "@/components/ui/CurrencyText";

interface DebtFormData {
  name: string;
  type: "internal" | "external";
  principal: number;
  interestRate: number;
  monthlyMin: number;
  interestType: "flat" | "diminishing";
  loanTenureMonths: number | null;
  totalRepayable: number;
  color: string | null;
}

interface DebtData {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  type: "internal" | "external" | "lent";
  principal: number;
  interestRate: number;
  monthlyMin: number;
  totalPaid: number;
  isClosed: boolean;
  interestType: "flat" | "diminishing";
  loanTenureMonths: number | null;
  totalRepayable: number;
}

interface DebtDetailSheetProps {
  mode: "add" | "edit";
  debt?: DebtData;
  open: boolean;
  onClose: () => void;
  onSave: (data: DebtFormData) => void;
  onCloseDebt?: (id: string, isClosed: boolean) => void;
  onDelete?: (id: string) => void;
}

const DEBT_TYPE_OPTIONS = [
  { value: "external" as const, label: "External", description: "Bank loans, credit cards, etc." },
  { value: "internal" as const, label: "Internal", description: "Family, friends, personal" },
];


export function DebtDetailSheet({
  mode,
  debt,
  open,
  onClose,
  onSave,
  onCloseDebt,
  onDelete,
}: DebtDetailSheetProps) {
  const haptic = useHaptic();
  const nameRef = useRef<HTMLInputElement>(null);
  const isEdit = mode === "edit";

  const [name, setName] = useState("");
  const [type, setType] = useState<"internal" | "external">("external");
  const [principal, setPrincipal] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [interestType, setInterestType] = useState<"flat" | "diminishing">("flat");
  const [tenure, setTenure] = useState("");
  const [monthlyMin, setMonthlyMin] = useState("");
  const [color, setColor] = useState<CatKey | null>(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isEdit && debt) {
      setName(debt.name);
      setType(debt.type === "lent" ? "external" : debt.type);
      setPrincipal(String(debt.principal));
      setInterestRate(debt.interestRate > 0 ? String(debt.interestRate) : "");
      setInterestType(debt.interestType ?? "flat");
      setTenure(debt.loanTenureMonths ? String(debt.loanTenureMonths) : "");
      setMonthlyMin(debt.monthlyMin > 0 ? String(debt.monthlyMin) : "");
      setColor((debt.color as CatKey | null) ?? null);
    } else {
      setName("");
      setType("external");
      setPrincipal("");
      setInterestRate("");
      setInterestType("flat");
      setTenure("");
      setMonthlyMin("");
      setColor(null);
    }
    setError("");
    setConfirmDelete(false);
    setIsSaving(false);
    const timer = setTimeout(() => nameRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [open, debt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const principalNum = parseFloat(principal) || 0;
  const rateNum = parseFloat(interestRate) || 0;
  const tenureNum = parseInt(tenure) || null;
  const monthlyMinNum = parseFloat(monthlyMin) || 0;
  const totalRepayable = calcTotalRepayable(principalNum, rateNum, tenureNum, interestType);
  const emi = tenureNum ? calcEMI(principalNum, rateNum, tenureNum, interestType) : 0;
  const showPreview = principalNum > 0 && rateNum > 0 && tenureNum;

  function handleSave() {
    if (!name.trim()) {
      setError("Name is required.");
      haptic.error();
      return;
    }
    if (!principalNum || principalNum <= 0) {
      setError("Principal must be greater than 0.");
      haptic.error();
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      onSave({
        name: name.trim(),
        type,
        principal: principalNum,
        interestRate: rateNum,
        monthlyMin: monthlyMinNum || emi,
        interestType,
        loanTenureMonths: tenureNum,
        totalRepayable,
        color,
      });
      haptic.success();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      haptic.error();
    } finally {
      setIsSaving(false);
    }
  }

  function handleDelete() {
    if (!debt || !onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      haptic.heavy();
      return;
    }
    onDelete(debt.id);
    onClose();
  }

  function handleCloseDebt() {
    if (!debt || !onCloseDebt) return;
    haptic.success();
    onCloseDebt(debt.id, !debt.isClosed);
    onClose();
  }

  const inputCls =
    "w-full bg-card border border-border rounded-[13px] px-3.5 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40";
  const labelCls =
    "block mb-1.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground";

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content
          aria-describedby="debt-sheet-desc"
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card focus:outline-none max-h-[92dvh]"
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="mx-auto w-9 h-1 bg-border rounded-full" />
          </div>

          <div className="overflow-y-auto flex-1">
            {/* Header */}
            <div className="px-6 pt-2 pb-4 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground">
                    {isEdit ? "Edit debt" : "New debt"}
                  </Drawer.Title>
                  {isEdit && debt && (
                    <p className="text-[13px] font-medium text-muted-foreground mt-0.5">{debt.name}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="size-8 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
              <p id="debt-sheet-desc" className="sr-only">
                {isEdit ? "Edit debt details" : "Add a new debt"}
              </p>
            </div>

            {/* Form */}
            <div className="px-6 py-2 space-y-3.5">
              {/* Name */}
              <div>
                <label className={labelCls}>Name</label>
                <input
                  ref={nameRef}
                  type="text"
                  placeholder="e.g. Car Loan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Color */}
              <div>
                <label className={labelCls}>Color</label>
                <ColorPicker value={color} onChange={setColor} />
              </div>

              {/* Principal + Interest Rate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Principal</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={principal}
                    onChange={(e) => setPrincipal(e.target.value)}
                    className={`${inputCls} tabular-nums`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Interest (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0.0"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    className={`${inputCls} tabular-nums`}
                  />
                </div>
              </div>

              {/* Interest Type */}
              <div>
                <label className={labelCls}>Interest Type</label>
                <div className="flex gap-2">
                  {(["flat", "diminishing"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setInterestType(t)}
                      className={`flex-1 py-2.5 rounded-pill text-[12px] font-bold capitalize transition-colors ${
                        interestType === t
                          ? "bg-[var(--pill)] text-[var(--pill-foreground)]"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 font-medium">
                  {interestType === "flat"
                    ? "Interest on original principal throughout"
                    : "Interest on reducing balance (EMI-based)"}
                </p>
              </div>

              {/* Tenure + Monthly Min */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>
                    Tenure <span className="normal-case">(months, optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 24"
                    value={tenure}
                    onChange={(e) => setTenure(e.target.value)}
                    className={`${inputCls} tabular-nums`}
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    Monthly Min
                    {emi > 0 && <span className="ml-1 text-[9px] text-muted-foreground normal-case inline-flex items-baseline gap-0.5">(EMI: <CurrencyText value={emi} />)</span>}
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder={emi > 0 ? String(emi) : "0"}
                    value={monthlyMin}
                    onChange={(e) => setMonthlyMin(e.target.value)}
                    className={`${inputCls} tabular-nums`}
                  />
                </div>
              </div>

              {/* Debt Type */}
              <div>
                <label className={labelCls}>Debt Type</label>
                <BottomSheetSelect
                  title="Debt Type"
                  options={DEBT_TYPE_OPTIONS}
                  value={type}
                  onChange={(val) => setType(val as "internal" | "external")}
                  className="flex items-center justify-between rounded-[13px] border border-border bg-card px-3.5 py-3 text-sm font-medium text-foreground"
                />
              </div>

              {/* Dynamic repayable preview */}
              {showPreview && (
                <div className="rounded-tile bg-tile p-3.5 space-y-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[12px] font-semibold text-muted-foreground">Total Repayable</span>
                    <CurrencyText value={totalRepayable} className="figure text-[14px] text-foreground" />
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[12px] font-semibold text-muted-foreground">Total Interest</span>
                    <CurrencyText value={totalRepayable - principalNum} className="figure text-[14px] text-muted-foreground" />
                  </div>
                  {emi > 0 && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-[12px] font-semibold text-muted-foreground">Monthly EMI</span>
                      <CurrencyText value={emi} className="figure text-[14px] text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}

              {error && (
                <p className="text-[11px] font-medium text-neg">{error}</p>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="px-6 pb-8 pt-3 shrink-0 space-y-2.5">
            {isEdit && debt && (
              <div className="flex gap-2">
                <button
                  onClick={handleCloseDebt}
                  className="flex-1 h-[44px] rounded-pill text-[13px] font-bold bg-muted text-foreground hover:bg-muted/70 transition-colors"
                >
                  {debt.isClosed ? "Reopen Debt" : "Close Debt"}
                </button>
                <button
                  onClick={handleDelete}
                  className={`px-5 h-[44px] rounded-pill text-[13px] font-bold transition-colors ${
                    confirmDelete
                      ? "bg-[var(--neg-dim)] text-neg"
                      : "bg-muted text-muted-foreground hover:text-neg"
                  }`}
                >
                  {confirmDelete ? "Confirm" : "Delete"}
                </button>
              </div>
            )}
            <div className="flex gap-2">
              {!isEdit && (
                <button
                  onClick={onClose}
                  className="flex-1 h-[48px] rounded-pill text-sm font-semibold bg-muted text-foreground"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 h-[48px] rounded-pill text-sm font-bold bg-[var(--pill)] text-[var(--pill-foreground)] disabled:opacity-40 active:scale-[0.98] transition-all"
              >
                {isSaving ? "Saving…" : isEdit ? "Save Changes" : "Add Debt"}
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
