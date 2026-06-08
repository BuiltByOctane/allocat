"use client";

import { useState, useEffect, useRef } from "react";
import { Drawer } from "vaul";
import { ConfirmDrawer } from "@/components/ui/ConfirmDrawer";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { CurrencySymbol } from "@/components/ui/CurrencySymbol";
import { Card } from "@/components/ui/Card";
import { HeroCard } from "@/components/ui/HeroCard";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { useHaptic } from "@/lib/hooks/useHaptic";
import {
  useAddDebt,
  useUpdateDebt,
  useDeleteDebt,
  useMakePayment,
} from "@/lib/hooks/useDebt";

type Lent = {
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

// ── Lent Detail Sheet ─────────────────────────────────────────────────────────

export function LentDetailSheet({
  mode,
  lent,
  open,
  onClose,
  onSave,
  onSettle,
  onDelete,
}: {
  mode: "add" | "edit";
  lent?: Lent;
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; principal: number; expectedPayoffDate: string | null }) => void;
  onSettle?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const haptic = useHaptic();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  const [prevLentId, setPrevLentId] = useState(lent?.id);
  if (open !== prevOpen || lent?.id !== prevLentId) {
    setPrevOpen(open);
    setPrevLentId(lent?.id);
    if (open) {
      if (mode === "edit" && lent) {
        setName(lent.name);
        setAmount(String(lent.principal));
        setExpectedDate(lent.expectedPayoffDate ?? "");
      } else {
        setName("");
        setAmount("");
        setExpectedDate("");
      }
      setError("");
      setConfirmDelete(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => nameRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [open, lent?.id]);

  function handleSave() {
    if (!name.trim()) { setError("Name is required."); haptic.error(); return; }
    const principal = parseFloat(amount);
    if (!principal || principal <= 0) { setError("Amount must be greater than 0."); haptic.error(); return; }
    onSave({ name: name.trim(), principal, expectedPayoffDate: expectedDate || null });
    haptic.success();
    onClose();
  }

  function handleSettle() {
    if (!lent || !onSettle) return;
    haptic.success();
    onSettle(lent.id);
    onClose();
  }

  function handleDelete() {
    if (!lent || !onDelete) return;
    if (!confirmDelete) { setConfirmDelete(true); haptic.heavy(); return; }
    onDelete(lent.id);
    onClose();
  }

  const inputCls =
    "w-full bg-card border border-border rounded-[13px] px-3.5 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40";
  const labelCls =
    "block mb-1.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground";

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content
          aria-describedby="lent-sheet-desc"
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card focus:outline-none max-h-[85dvh]"
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="mx-auto w-9 h-1 bg-border rounded-full" />
          </div>
          <div className="overflow-y-auto flex-1">
            <div className="px-6 pt-2 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground">
                    {mode === "edit" ? "Edit lend" : "New lend"}
                  </Drawer.Title>
                  {mode === "edit" && lent && (
                    <p className="text-[13px] font-medium text-muted-foreground mt-0.5">{lent.name}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="size-8 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
              <p id="lent-sheet-desc" className="sr-only">Lend details</p>
            </div>
            <div className="px-6 py-2 space-y-3.5">
              <div>
                <label className={labelCls}>Name</label>
                <input
                  ref={nameRef}
                  type="text"
                  placeholder="Friend's name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Amount Lent</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`${inputCls} tabular-nums`}
                />
              </div>
              <div>
                <label className={labelCls}>
                  Expected Back Date <span className="normal-case">(optional)</span>
                </label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              {error && <p className="text-[11px] font-medium text-neg">{error}</p>}
            </div>
          </div>
          <div className="px-6 pb-8 pt-3 shrink-0 space-y-2.5">
            {mode === "edit" && lent && !lent.isClosed && (
              <div className="flex gap-2">
                <button
                  onClick={handleSettle}
                  className="flex-1 h-[44px] rounded-pill text-[13px] font-bold bg-muted text-foreground hover:bg-muted/70 transition-colors"
                >
                  Mark Settled
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
            {mode === "edit" && lent?.isClosed && (
              <div className="flex gap-2">
                <button
                  onClick={() => { if (lent && onSettle) { onSettle(lent.id); onClose(); }}}
                  className="flex-1 h-[44px] rounded-pill text-[13px] font-bold bg-muted text-foreground hover:bg-muted/70 transition-colors"
                >
                  Reopen
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
              {mode === "add" && (
                <button
                  onClick={onClose}
                  className="flex-1 h-[48px] rounded-pill text-sm font-semibold bg-muted text-foreground"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                className="flex-1 h-[48px] rounded-pill text-sm font-bold bg-[var(--pill)] text-[var(--pill-foreground)] active:scale-[0.98] transition-all"
              >
                {mode === "edit" ? "Save Changes" : "Add Lend"}
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// ── Quick Payment Sheet ───────────────────────────────────────────────────────

export function PaymentSheet({
  lent,
  open,
  onClose,
  onPay,
}: {
  lent?: Lent;
  open: boolean;
  onClose: () => void;
  onPay: (id: string, amount: number) => void;
}) {
  const haptic = useHaptic();
  const [amount, setAmount] = useState("");

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setAmount("");
  }

  function handlePay() {
    if (!lent) return;
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    haptic.success();
    onPay(lent.id, val);
    onClose();
  }

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content
          aria-describedby="pay-sheet-desc"
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card focus:outline-none"
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="mx-auto w-9 h-1 bg-border rounded-full" />
          </div>
          <div className="px-6 pt-2 pb-4">
            <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground">
              Log payment
            </Drawer.Title>
            {lent && (
              <p className="text-[13px] font-medium text-muted-foreground mt-0.5">{lent.name}</p>
            )}
            <p id="pay-sheet-desc" className="sr-only">Record received payment</p>
          </div>
          <div className="px-6 py-2">
            <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Amount</div>
            <div className="flex items-baseline gap-1.5 rounded-[13px] border border-border bg-card px-3.5 py-3">
              <span className="currency-symbol text-muted-foreground" style={{ fontSize: "20px" }}><CurrencySymbol /></span>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0"
                autoFocus
                className="figure bg-transparent border-none outline-none text-[24px] text-foreground w-full p-0 placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="px-6 pb-8 pt-4 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 h-[48px] rounded-pill text-sm font-semibold bg-muted text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handlePay}
              disabled={!amount || parseFloat(amount) <= 0}
              className="flex-1 h-[48px] rounded-pill text-sm font-bold bg-[var(--pill)] text-[var(--pill-foreground)] disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              Log payment →
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}


// ── Main Component ────────────────────────────────────────────────────────────

export default function LentListView({ lents, onBack }: { lents: Lent[]; onBack: () => void }) {
  const haptic = useHaptic();
  const addDebtMutation = useAddDebt();
  const updateDebtMutation = useUpdateDebt();
  const deleteDebtMutation = useDeleteDebt();
  const makePaymentMutation = useMakePayment();

  const [sheetMode, setSheetMode] = useState<"add" | "edit">("add");
  const [sheetLent, setSheetLent] = useState<Lent | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paySheetLent, setPaySheetLent] = useState<Lent | undefined>();
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [lentToDelete, setLentToDelete] = useState<string | null>(null);

  const activeLents = lents.filter((d) => !d.isClosed);
  const closedLents = lents.filter((d) => d.isClosed);

  const totalActive = activeLents.reduce((s, d) => s + Math.max(0, d.principal - d.totalPaid), 0);

  function openAdd() {
    setSheetMode("add");
    setSheetLent(undefined);
    setSheetOpen(true);
  }

  function openEdit(lent: Lent) {
    setSheetMode("edit");
    setSheetLent(lent);
    setSheetOpen(true);
  }

  function openPay(lent: Lent) {
    setPaySheetLent(lent);
    setPaySheetOpen(true);
  }

  function handleSave(data: { name: string; principal: number; expectedPayoffDate: string | null }) {
    if (sheetMode === "add") {
      addDebtMutation.mutate({
        name: data.name,
        type: "lent",
        principal: data.principal,
        interestRate: 0,
        monthlyMin: 0,
        expectedPayoffDate: data.expectedPayoffDate,
        interestType: "flat",
        loanTenureMonths: null,
      });
    } else if (sheetLent) {
      updateDebtMutation.mutate({
        id: sheetLent.id,
        updates: {
          name: data.name,
          principal: data.principal,
          expected_payoff_date: data.expectedPayoffDate,
        },
      });
    }
  }

  function handleSettle(id: string) {
    const lent = lents.find((d) => d.id === id);
    if (!lent) return;
    updateDebtMutation.mutate({ id, updates: { is_closed: !lent.isClosed } });
  }

  function handleDeleteLent(id: string) {
    setLentToDelete(id);
  }

  function handlePay(id: string, amount: number) {
    makePaymentMutation.mutate({ id, amount });
  }

  const now = new Date();
  const caption = `${now.toLocaleString("en-US", { month: "short" })} ${now.getFullYear()}`;

  return (
    <div className="px-4 pt-4 flex flex-col gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 px-1 pt-1">
        <button
          onClick={() => { haptic.light(); onBack(); }}
          aria-label="Back"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        </button>
        <div>
          <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground">Money Out</h1>
          <p className="text-[11px] font-medium text-muted-foreground mt-1">
            Friends &amp; lending · {caption}
          </p>
        </div>
      </div>

      {/* Lime hero */}
      <HeroCard
        label="Total outstanding"
        value={<CurrencyText value={totalActive} />}
      >
        <div className="text-[11px] font-semibold text-[var(--accent-ink)]">
          {activeLents.length} active {activeLents.length === 1 ? "lend" : "lends"}
          {closedLents.length > 0 && ` · ${closedLents.length} settled`}
        </div>
      </HeroCard>

      {/* Active lends header */}
      <div className="flex items-center justify-between px-1 mt-1">
        <span className="font-display text-[15px] font-bold text-foreground">
          Active lends · {activeLents.length}
        </span>
        <button
          onClick={openAdd}
          className="flex items-center gap-1 text-[13px] font-bold text-foreground"
        >
          <span className="text-accent-strong text-base leading-none">＋</span>New
        </button>
      </div>

      {activeLents.length === 0 && (
        <Card compact>
          <p className="py-4 text-center text-[12px] font-medium text-muted-foreground">No active lends.</p>
        </Card>
      )}

      <div className="flex flex-col gap-2.5">
        {activeLents.map((lent) => {
          const remaining = Math.max(0, lent.principal - lent.totalPaid);
          const paidPct = lent.principal > 0 ? lent.totalPaid / lent.principal : 0;
          return (
            <Card key={lent.id} compact>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => openEdit(lent)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-tile text-[14px] font-bold text-muted-foreground uppercase">
                    {lent.name.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-bold text-foreground truncate">
                      {lent.name}
                    </div>
                    <div className="text-[10.5px] font-semibold text-muted-foreground">
                      {lent.expectedPayoffDate
                        ? `Due ${new Date(lent.expectedPayoffDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                        : "No due date"}
                    </div>
                  </div>
                </button>
                <div className="text-right shrink-0">
                  <div className="figure text-[15px] text-foreground"><CurrencyText value={remaining} /></div>
                  <div className="text-[9.5px] font-semibold text-muted-foreground">remaining</div>
                </div>
                <Button size="sm" variant="primary" onClick={() => openPay(lent)}>
                  Log
                </Button>
              </div>
              {lent.totalPaid > 0 && (
                <>
                  <Progress className="mt-2.5 h-1.5" value={Math.min(paidPct, 1) * 100} />
                  <div className="flex justify-between mt-1.5 text-[9.5px] font-semibold text-muted-foreground">
                    <span>{Math.round(paidPct * 100)}% returned</span>
                    <span className="inline-flex items-baseline gap-1">of <CurrencyText value={lent.principal} /></span>
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>

      {/* Settled */}
      {closedLents.length > 0 && (
        <>
          <div className="px-1 mt-1">
            <span className="font-display text-[15px] font-bold text-foreground">
              Settled · {closedLents.length}
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            {closedLents.map((lent) => (
              <button
                key={lent.id}
                onClick={() => openEdit(lent)}
                className="w-full text-left active:scale-[0.99] transition-transform"
              >
                <Card compact className="flex items-center gap-3 opacity-60">
                  <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-accent-strong text-[var(--accent-ink)]">
                    <span className="material-symbols-outlined text-[15px]">check</span>
                  </span>
                  <span className="flex-1 min-w-0 text-[13.5px] font-bold text-foreground truncate">{lent.name}</span>
                  <div className="text-[11px] font-semibold text-muted-foreground inline-flex items-baseline gap-1.5">
                    Settled
                    <CurrencyText value={lent.principal} />
                  </div>
                </Card>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Bottom spacer for mobile nav */}
      <div className="h-28 md:h-12" />

      {/* ── Sheets ────────────────────────────────────────────────── */}
      <LentDetailSheet
        mode={sheetMode}
        lent={sheetLent}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={handleSave}
        onSettle={handleSettle}
        onDelete={handleDeleteLent}
      />

      <PaymentSheet
        lent={paySheetLent}
        open={paySheetOpen}
        onClose={() => setPaySheetOpen(false)}
        onPay={handlePay}
      />

      <ConfirmDrawer
        isOpen={lentToDelete !== null}
        onClose={() => setLentToDelete(null)}
        onConfirm={() => {
          if (lentToDelete) {
            deleteDebtMutation.mutate(lentToDelete);
            setLentToDelete(null);
          }
        }}
        title="Delete Lend Record"
        description="This lend record will be permanently deleted. This cannot be undone."
        confirmText="Delete"
      />
    </div>
  );
}
