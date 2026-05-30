"use client";

import { useState, useEffect, useRef } from "react";
import { Drawer } from "vaul";
import { ConfirmDrawer } from "@/components/ui/ConfirmDrawer";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { CurrencySymbol } from "@/components/ui/CurrencySymbol";
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

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content
          aria-describedby="lent-sheet-desc"
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-card border-t border-border focus:outline-none max-h-[85dvh]"
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 bg-muted rounded-full" />
          </div>
          <div className="overflow-y-auto flex-1">
            <div className="px-5 pt-2 pb-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <Drawer.Title className="text-[10px] font-mono font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {mode === "edit" ? "Edit Lend" : "New Lend"}
                  </Drawer.Title>
                  {mode === "edit" && lent && (
                    <p className="text-base font-semibold text-foreground mt-0.5 tracking-tight">{lent.name}</p>
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
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">Name</label>
                <input
                  ref={nameRef}
                  type="text"
                  placeholder="Friend's name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">Amount Lent</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono tabular-nums text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">
                  Expected Back Date <span className="normal-case">(optional)</span>
                </label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {error && <p className="text-[11px] text-red-400 font-mono">{error}</p>}
            </div>
          </div>
          <div className="px-5 pb-8 pt-3 border-t border-border shrink-0 space-y-2">
            {mode === "edit" && lent && !lent.isClosed && (
              <div className="flex gap-2">
                <button
                  onClick={handleSettle}
                  className="flex-1 py-2.5 rounded-lg text-xs font-mono uppercase tracking-[0.1em] bg-muted text-foreground hover:bg-muted/80 transition-colors"
                >
                  Mark Settled
                </button>
                <button
                  onClick={handleDelete}
                  className={`px-4 py-2.5 rounded-lg text-xs font-mono uppercase tracking-[0.1em] transition-colors ${
                    confirmDelete
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-muted text-muted-foreground hover:text-red-400"
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
                  className="flex-1 py-2.5 rounded-lg text-xs font-mono uppercase tracking-[0.1em] bg-muted text-foreground hover:bg-muted/80 transition-colors"
                >
                  Reopen
                </button>
                <button
                  onClick={handleDelete}
                  className={`px-4 py-2.5 rounded-lg text-xs font-mono uppercase tracking-[0.1em] transition-colors ${
                    confirmDelete
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-muted text-muted-foreground hover:text-red-400"
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
                  className="flex-1 py-3 rounded-lg text-sm font-mono uppercase tracking-[0.1em] bg-muted text-foreground transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                className="flex-1 py-3 rounded-lg text-sm font-mono uppercase tracking-[0.1em] bg-primary text-primary-foreground transition-all active:scale-95"
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
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content
          aria-describedby="pay-sheet-desc"
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-card border-t border-border focus:outline-none"
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 bg-muted rounded-full" />
          </div>
          <div className="px-5 pt-2 pb-4 border-b border-border">
            <Drawer.Title className="text-[10px] font-mono font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Log Payment
            </Drawer.Title>
            {lent && (
              <p className="text-base font-semibold text-foreground mt-0.5">{lent.name}</p>
            )}
            <p id="pay-sheet-desc" className="sr-only">Record received payment</p>
          </div>
          <div className="px-5 py-4">
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2">Step 01</div>
            <div className="flex items-baseline gap-1.5 py-3 border-t border-border border-b border-b-border">
              <span className="currency-symbol font-sans text-foreground/30" style={{ fontSize: "calc(0.62 * 28px)" }}><CurrencySymbol /></span>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0"
                autoFocus
                className="bg-transparent border-none outline-none font-display text-[28px] tracking-[-0.02em] text-foreground w-full p-0 tabular-nums placeholder:text-foreground/30"
              />
            </div>
          </div>
          <div className="px-5 pb-8 pt-3 border-t border-border flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-lg text-sm font-mono uppercase tracking-[0.1em] bg-muted text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handlePay}
              disabled={!amount || parseFloat(amount) <= 0}
              className="flex-1 py-3 rounded-lg text-sm font-mono uppercase tracking-[0.1em] bg-primary text-primary-foreground disabled:opacity-50 active:scale-95 transition-all"
            >
              Log Payment →
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// 20-segment dash bar
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
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      {/* ── Header ───────────────────────────────────────────────── */}
      <header className="px-7 pt-14 pb-[18px] border-b border-border flex items-end justify-between">
        <div>
          <button
            onClick={() => { haptic.light(); onBack(); }}
            className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-3"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back
          </button>
          <div className="font-display text-[28px] leading-none tracking-[-0.02em] text-foreground">Money Out</div>
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mt-2">
            Friends &amp; Lending · {caption}
          </div>
        </div>
      </header>

      <main className="pb-10">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <div className="px-7 pt-7 pb-6">
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2">
            Total Outstanding
          </div>
          <CurrencyText value={totalActive} className="font-display text-[44px] leading-[0.95] tracking-[-0.025em] text-foreground" />
          <div className="font-mono text-[11px] text-muted-foreground mt-2">
            ↳ {activeLents.length} active {activeLents.length === 1 ? "lend" : "lends"}
          </div>
        </div>

        <div className="h-px bg-border mx-7" />

        {/* ── Active Lends header ───────────────────────────────────── */}
        <div className="px-7 pt-4 pb-2 flex justify-between items-baseline">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
            Active Lends · {activeLents.length}
          </span>
          <button
            onClick={openAdd}
            className="font-mono text-[10px] tracking-[0.14em] uppercase text-foreground underline underline-offset-2 decoration-foreground/30 hover:decoration-foreground transition-all"
          >
            + New
          </button>
        </div>

        {activeLents.length === 0 && (
          <div className="px-7 py-8 text-center">
            <p className="font-mono text-[11px] text-muted-foreground">No active lends.</p>
          </div>
        )}

        <div className="px-7">
          {activeLents.map((lent, i) => {
            const remaining = Math.max(0, lent.principal - lent.totalPaid);
            const paidPct = lent.principal > 0 ? lent.totalPaid / lent.principal : 0;
            return (
              <div key={lent.id} className="py-3.5 border-t border-border last:border-b last:border-b-border">
                <div className="flex justify-between items-start">
                  <button
                    onClick={() => openEdit(lent)}
                    className="flex items-baseline gap-2.5 flex-1 text-left"
                  >
                    <span className="font-mono text-[10px] text-foreground/30 shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <span className="text-[17px] font-semibold tracking-tight text-foreground leading-none">
                        {lent.name}
                      </span>
                      {lent.expectedPayoffDate && (
                        <div className="font-mono text-[9px] text-muted-foreground mt-1 tracking-[0.08em] uppercase">
                          Due {new Date(lent.expectedPayoffDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </div>
                      )}
                    </div>
                  </button>
                  <div className="text-right shrink-0 ml-4">
                    <CurrencyText value={remaining} className="font-mono text-[13px] text-foreground" />
                    <div className="font-mono text-[9px] text-muted-foreground tracking-[0.08em] uppercase">remaining</div>
                  </div>
                </div>
                {lent.totalPaid > 0 && <SegBar pct={paidPct} />}
                {lent.totalPaid > 0 && (
                  <div className="flex justify-between mt-1.5">
                    <span className="font-mono text-[9px] text-muted-foreground tracking-[0.08em] uppercase">
                      {Math.round(paidPct * 100)}% returned
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground tracking-[0.08em] uppercase inline-flex items-baseline gap-1">
                      of <CurrencyText value={lent.principal} />
                    </span>
                  </div>
                )}
                <button
                  onClick={() => openPay(lent)}
                  className="mt-3 w-full py-3 bg-foreground text-background font-mono text-[10px] tracking-[0.14em] uppercase active:scale-[0.98] transition-all"
                >
                  Log Payment →
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Settled ───────────────────────────────────────────────── */}
        {closedLents.length > 0 && (
          <>
            <div className="h-px bg-border mx-7 mt-4" />
            <div className="px-7 pt-4 pb-2">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                Settled · {closedLents.length}
              </span>
            </div>
            <div className="px-7">
              {closedLents.map((lent, i) => (
                <button
                  key={lent.id}
                  onClick={() => openEdit(lent)}
                  className="w-full text-left py-3.5 border-t border-border last:border-b last:border-b-border opacity-40 hover:opacity-60 transition-opacity"
                >
                  <div className="flex justify-between items-baseline">
                    <div className="flex items-baseline gap-2.5">
                      <span className="font-mono text-[10px] text-foreground/30">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[15px] font-semibold tracking-tight text-foreground">
                        {lent.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-muted-foreground tracking-[0.08em] uppercase">✓ Settled</span>
                      <CurrencyText value={lent.principal} className="font-mono text-[11px] text-muted-foreground" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </main>

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
