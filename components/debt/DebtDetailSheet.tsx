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

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content
          aria-describedby="debt-sheet-desc"
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-card border-t border-border focus:outline-none max-h-[92dvh]"
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 bg-muted rounded-full" />
          </div>

          <div className="overflow-y-auto flex-1">
            {/* Header */}
            <div className="px-5 pt-2 pb-4 border-b border-border shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <Drawer.Title className="text-[10px] font-mono font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {isEdit ? "Edit Debt" : "New Debt"}
                  </Drawer.Title>
                  {isEdit && debt && (
                    <p className="text-base font-semibold text-foreground mt-0.5 tracking-tight">{debt.name}</p>
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
            <div className="px-5 py-4 space-y-3">
              {/* Name */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">Name</label>
                <input
                  ref={nameRef}
                  type="text"
                  placeholder="e.g. Car Loan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Color */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">Color</label>
                <ColorPicker value={color} onChange={setColor} />
              </div>

              {/* Principal + Interest Rate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">Principal</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={principal}
                    onChange={(e) => setPrincipal(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono tabular-nums text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">Interest (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0.0"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono tabular-nums text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Interest Type */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">Interest Type</label>
                <div className="flex gap-2">
                  {(["flat", "diminishing"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setInterestType(t)}
                      className={`flex-1 py-2.5 rounded-lg text-xs font-mono uppercase tracking-[0.1em] transition-colors ${
                        interestType === t
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 font-mono">
                  {interestType === "flat"
                    ? "Interest on original principal throughout"
                    : "Interest on reducing balance (EMI-based)"}
                </p>
              </div>

              {/* Tenure + Monthly Min */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">
                    Tenure <span className="normal-case">(months, optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 24"
                    value={tenure}
                    onChange={(e) => setTenure(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono tabular-nums text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">
                    Monthly Min
                    {emi > 0 && <span className="ml-1 text-[9px] text-muted-foreground normal-case inline-flex items-baseline gap-0.5">(EMI: <CurrencyText value={emi} />)</span>}
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder={emi > 0 ? String(emi) : "0"}
                    value={monthlyMin}
                    onChange={(e) => setMonthlyMin(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono tabular-nums text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Debt Type */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">Debt Type</label>
                <BottomSheetSelect
                  title="Debt Type"
                  options={DEBT_TYPE_OPTIONS}
                  value={type}
                  onChange={(val) => setType(val as "internal" | "external")}
                />
              </div>

              {/* Dynamic repayable preview */}
              {showPreview && (
                <div className="rounded-lg border border-border bg-background p-3 space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Total Repayable</span>
                    <CurrencyText value={totalRepayable} className="font-mono text-sm text-foreground" />
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Total Interest</span>
                    <CurrencyText value={totalRepayable - principalNum} className="font-mono text-sm text-muted-foreground" />
                  </div>
                  {emi > 0 && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Monthly EMI</span>
                      <CurrencyText value={emi} className="font-mono text-sm text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}

              {error && (
                <p className="text-[11px] text-neg font-mono">{error}</p>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="px-5 pb-8 pt-3 border-t border-border shrink-0 space-y-2">
            {isEdit && debt && (
              <div className="flex gap-2">
                <button
                  onClick={handleCloseDebt}
                  className="flex-1 py-2.5 rounded-lg text-xs font-mono uppercase tracking-[0.1em] bg-muted text-foreground hover:bg-muted/80 transition-colors"
                >
                  {debt.isClosed ? "Reopen Debt" : "Close Debt"}
                </button>
                <button
                  onClick={handleDelete}
                  className={`px-4 py-2.5 rounded-lg text-xs font-mono uppercase tracking-[0.1em] transition-colors ${
                    confirmDelete
                      ? "bg-destructive/20 text-destructive border border-destructive/30"
                      : "bg-muted text-muted-foreground hover:text-destructive"
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
                  className="flex-1 py-3 rounded-lg text-sm font-mono uppercase tracking-[0.1em] bg-muted text-foreground transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 py-3 rounded-lg text-sm font-mono uppercase tracking-[0.1em] bg-primary text-primary-foreground disabled:opacity-50 transition-all active:scale-95"
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
