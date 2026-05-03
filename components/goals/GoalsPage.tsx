"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GoalDetailSheet } from "./GoalDetailSheet";
import type { GoalFormData } from "./GoalDetailSheet";
import { BottomSheetSelect } from "@/components/ui/BottomSheetSelect";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { useHaptic } from "@/lib/hooks/useHaptic";
import {
  useGoalsData,
  useAddGoal,
  useUpdateGoal,
  useDeleteGoal,
  useUpdateGoalIcon,
} from "@/lib/hooks/useGoals";

type GoalRow = {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  target_amount: number;
  current_amount: number;
  notes: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
};

function SegBar({ pct, segments = 20 }: { pct: number; segments?: number }) {
  return (
    <div className="flex gap-[2px] mt-2.5">
      {Array.from({ length: segments }).map((_, j) => (
        <div
          key={j}
          className="flex-1"
          style={{
            height: 3,
            background: j / segments < pct ? "var(--foreground)" : "var(--progress-empty)",
          }}
        />
      ))}
    </div>
  );
}

interface GoalsPageProps {
  overrideGoals?: GoalRow[];
}

export default function GoalsPage({ overrideGoals }: GoalsPageProps) {
  const router = useRouter();
  const haptic = useHaptic();
  const { data: fetchedGoals = [], isLoading } = useGoalsData();
  const goals = overrideGoals ?? fetchedGoals;

  const addGoalMutation = useAddGoal();
  const updateGoalMutation = useUpdateGoal();
  const deleteGoalMutation = useDeleteGoal();
  const updateIconMutation = useUpdateGoalIcon();

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"add" | "edit">("add");
  const [sheetGoal, setSheetGoal] = useState<(typeof goals)[0] | undefined>(undefined);

  // Quick update state
  const [quickGoalId, setQuickGoalId] = useState("");
  const [quickAmount, setQuickAmount] = useState("");

  useEffect(() => {
    if (goals.length > 0 && !goals.find((g) => g.id === quickGoalId)) {
      setQuickGoalId(goals[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals.length]);

  function openAddSheet() {
    setSheetMode("add");
    setSheetGoal(undefined);
    setSheetOpen(true);
  }

  function openEditSheet(goal: (typeof goals)[0]) {
    setSheetMode("edit");
    setSheetGoal(goal);
    setSheetOpen(true);
  }

  function handleSheetSave(formData: GoalFormData) {
    if (sheetMode === "add") {
      addGoalMutation.mutate({
        name: formData.name,
        targetAmount: formData.targetAmount,
        notes: formData.notes || null,
        priority: goals.length,
      });
    } else if (sheetGoal) {
      updateGoalMutation.mutate({
        id: sheetGoal.id,
        updates: {
          name: formData.name,
          target_amount: formData.targetAmount,
          current_amount: formData.currentAmount,
          notes: formData.notes || null,
        },
      });
      if (formData.icon !== (sheetGoal.icon ?? null)) {
        if (formData.icon) {
          updateIconMutation.mutate({ id: sheetGoal.id, icon: formData.icon });
        }
      }
    }
  }

  function handleDelete(id: string) {
    deleteGoalMutation.mutate(id);
  }

  function handleIconChange(id: string, icon: string) {
    updateIconMutation.mutate({ id, icon });
  }

  function handleQuickUpdate() {
    const amount = parseFloat(quickAmount);
    if (isNaN(amount) || amount < 0 || !quickGoalId) return;
    haptic.success();
    updateGoalMutation.mutate(
      { id: quickGoalId, updates: { current_amount: amount } },
      { onSuccess: () => setQuickAmount("") }
    );
  }

  const selectedGoal = goals.find((g) => g.id === quickGoalId);
  const selectedPct = selectedGoal
    ? Math.min(1, Number(selectedGoal.current_amount) / (Number(selectedGoal.target_amount) || 1))
    : 0;
  const selectedRemaining = selectedGoal
    ? Math.max(0, Number(selectedGoal.target_amount) - Number(selectedGoal.current_amount))
    : 0;

  return (
    <>
      {/* Header */}
      <header className="fixed w-full top-0 z-10 bg-background px-7 pt-6 pb-[18px] border-b border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { haptic.light(); router.back(); }}
            className="text-muted-foreground hover:text-foreground transition-colors mr-1"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <div className="font-display text-[32px] leading-none tracking-[-0.02em] text-foreground">Goals</div>
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mt-2">
              Savings Tracker · {goals.length} {goals.length === 1 ? "goal" : "goals"}
            </div>
          </div>
        </div>
      </header>

      <main className="pb-10 mt-20">
        {/* ── Quick Progress Update ─────────────────────────────── */}
        {goals.length > 0 && (
          <>
            <div id="goals-quick-section" className="px-7 pt-5 pb-1 flex justify-between items-baseline">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                Quick Update
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">Step 01</span>
            </div>

            <div className="px-7">
              {/* Goal picker */}
              <div className="py-2 border-t border-border">
                <BottomSheetSelect
                  title="Select Goal"
                  options={goals.map((g) => {
                    const pct = Math.round(
                      Math.min(100, (Number(g.current_amount) / (Number(g.target_amount) || 1)) * 100)
                    );
                    return {
                      value: g.id,
                      label: g.name,
                      description: `${pct}% complete`,
                      icon: g.icon ?? undefined,
                    };
                  })}
                  value={quickGoalId}
                  onChange={setQuickGoalId}
                />
              </div>

              {/* Selected goal info */}
              {selectedGoal && (
                <div className="py-2 border-t border-border flex items-baseline justify-between">
                  <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground">
                    {Math.round(selectedPct * 100)}% complete · remaining
                  </span>
                  <CurrencyText value={selectedRemaining} className="font-mono text-[13px] text-foreground" />
                </div>
              )}

              {/* Amount + action */}
              <div className="flex items-baseline justify-between py-4 border-t border-border border-b border-b-border">
                <div className="flex items-baseline gap-1.5">
                  <span className="currency-symbol font-sans text-foreground/30" style={{ fontSize: "calc(0.62 * 28px)" }}>₹</span>
                  <input
                    type="number"
                    min="0"
                    value={quickAmount}
                    onChange={(e) => setQuickAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="0"
                    className="bg-transparent border-none outline-none font-display text-[28px] tracking-[-0.02em] text-foreground w-36 p-0 tabular-nums placeholder:text-foreground/30"
                  />
                </div>
                <button
                  onClick={handleQuickUpdate}
                  disabled={!quickAmount || parseFloat(quickAmount) < 0}
                  className="px-4 py-3 bg-foreground text-background font-mono text-[10px] tracking-[0.14em] uppercase disabled:opacity-30 active:scale-95 transition-all"
                >
                  Update →
                </button>
              </div>
            </div>

            <div className="h-px bg-border mx-7 mt-1" />
          </>
        )}

        {/* ── Goals List ───────────────────────────────────────── */}
        <div id="goals-list-header" className="px-7 pt-5 pb-1 flex justify-between items-baseline">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
            All Goals · {goals.length}
          </span>
          <button
            id="goals-add-btn"
            onClick={() => { haptic.light(); openAddSheet(); }}
            className="font-mono text-[10px] tracking-[0.14em] uppercase text-foreground underline underline-offset-2 decoration-foreground/30 hover:decoration-foreground transition-all"
          >
            + New
          </button>
        </div>

        <div className="px-7">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                Loading…
              </div>
            </div>
          ) : goals.length === 0 ? (
            <div className="border border-border border-t-0 py-12 text-center">
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-3">
                No goals yet
              </div>
              <button
                onClick={() => { haptic.light(); openAddSheet(); }}
                className="font-mono text-[10px] tracking-[0.14em] uppercase text-foreground underline underline-offset-2"
              >
                Add your first goal →
              </button>
            </div>
          ) : (
            <div>
              {goals.map((goal, i) => {
                const current = Number(goal.current_amount);
                const target = Number(goal.target_amount);
                const pct = target > 0 ? Math.min(1, current / target) : 0;
                const pctDisplay = Math.round(pct * 100);
                const num = String(i + 1).padStart(2, "0");

                return (
                  <button
                    key={goal.id}
                    id={i === 0 ? "goals-goal-row-0" : undefined}
                    onClick={() => { haptic.light(); openEditSheet(goal); }}
                    className="w-full text-left"
                    style={{
                      borderTop: i === 0 ? "1px solid var(--border)" : "none",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-[10px] text-muted-foreground shrink-0 tabular-nums">{num}</span>
                          <span className="text-lg grayscale shrink-0">{goal.icon || "🎯"}</span>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{goal.name}</div>
                            {goal.notes && (
                              <div className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">{goal.notes}</div>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-[11px] tabular-nums text-foreground">{pctDisplay}%</div>
                          <div className="font-mono text-[9px] text-muted-foreground tabular-nums mt-0.5">
                            <CurrencyText value={current} /> / <CurrencyText value={target} />
                          </div>
                        </div>
                      </div>
                      <SegBar pct={pct} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="h-28 md:h-8" />
      </main>

      <GoalDetailSheet
        mode={sheetMode}
        goal={sheetGoal}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={handleSheetSave}
        onDelete={handleDelete}
        onIconChange={handleIconChange}
      />
    </>
  );
}
