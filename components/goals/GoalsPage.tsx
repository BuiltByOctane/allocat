"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { GoalDetailSheet } from "./GoalDetailSheet";
import type { GoalFormData } from "./GoalDetailSheet";
import { BottomSheetSelect } from "@/components/ui/BottomSheetSelect";
import { ConfirmDrawer } from "@/components/ui/ConfirmDrawer";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { useHaptic } from "@/lib/hooks/useHaptic";
import {
  useGoalsData,
  useAddGoal,
  useUpdateGoal,
  useDeleteGoal,
  useUpdateGoalIcon,
  useAchieveGoalAsset,
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
  achieved_at: string | null;
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

type Tab = "active" | "achieved";

export default function GoalsPage({ overrideGoals }: GoalsPageProps) {
  const router = useRouter();
  const haptic = useHaptic();
  const { data: fetchedGoals = [], isLoading } = useGoalsData();
  const goals = (overrideGoals ?? fetchedGoals) as GoalRow[];

  const addGoalMutation = useAddGoal();
  const updateGoalMutation = useUpdateGoal();
  const deleteGoalMutation = useDeleteGoal();
  const updateIconMutation = useUpdateGoalIcon();
  const achieveMutation = useAchieveGoalAsset();

  const [tab, setTab] = useState<Tab>("active");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"add" | "edit">("add");
  const [sheetGoal, setSheetGoal] = useState<GoalRow | undefined>(undefined);
  const [confirmAchieveId, setConfirmAchieveId] = useState<string | null>(null);

  const activeGoals = useMemo(() => goals.filter((g) => !g.achieved_at), [goals]);
  const achievedGoals = useMemo(
    () =>
      goals
        .filter((g) => g.achieved_at)
        .sort((a, b) => (b.achieved_at ?? "").localeCompare(a.achieved_at ?? "")),
    [goals]
  );

  // Quick update state (only against active)
  const [quickGoalId, setQuickGoalId] = useState("");
  const [quickAmount, setQuickAmount] = useState("");

  useEffect(() => {
    if (activeGoals.length > 0 && !activeGoals.find((g) => g.id === quickGoalId)) {
      setQuickGoalId(activeGoals[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGoals.length]);

  function openAddSheet() {
    setSheetMode("add");
    setSheetGoal(undefined);
    setSheetOpen(true);
  }

  function openEditSheet(goal: GoalRow) {
    setSheetMode("edit");
    setSheetGoal(goal);
    setSheetOpen(true);
  }

  function handleSheetSave(formData: GoalFormData) {
    if (sheetMode === "add") {
      addGoalMutation.mutate({
        name: formData.name,
        targetAmount: formData.targetAmount,
        icon: formData.icon,
      });
    } else if (sheetGoal) {
      updateGoalMutation.mutate({
        id: sheetGoal.id,
        updates: {
          name: formData.name,
          target_amount: formData.targetAmount,
          current_amount: formData.currentAmount,
        },
      });
      if (formData.icon !== (sheetGoal.icon ?? null) && formData.icon) {
        updateIconMutation.mutate({ id: sheetGoal.id, icon: formData.icon });
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

  function handleAchieveConfirm() {
    if (!confirmAchieveId) return;
    haptic.heavy();
    achieveMutation.mutate(confirmAchieveId);
    setConfirmAchieveId(null);
  }

  const selectedGoal = activeGoals.find((g) => g.id === quickGoalId);
  const selectedPct = selectedGoal
    ? Math.min(1, Number(selectedGoal.current_amount) / (Number(selectedGoal.target_amount) || 1))
    : 0;
  const selectedRemaining = selectedGoal
    ? Math.max(0, Number(selectedGoal.target_amount) - Number(selectedGoal.current_amount))
    : 0;

  const list = tab === "active" ? activeGoals : achievedGoals;
  const confirmingGoal = goals.find((g) => g.id === confirmAchieveId);

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
              Tracked in Net Worth · {activeGoals.length} active · {achievedGoals.length} achieved
            </div>
          </div>
        </div>
      </header>

      <main className="pb-10 mt-20">
        {/* Tabs */}
        <div className="px-7 pt-4 flex gap-1 border-b border-border">
          {(["active", "achieved"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { haptic.light(); setTab(t); }}
              className={`font-mono text-[10px] tracking-[0.14em] uppercase px-3 py-2 border-b-2 transition-colors ${
                tab === t
                  ? "text-foreground border-foreground"
                  : "text-muted-foreground border-transparent"
              }`}
            >
              {t === "active" ? `Active · ${activeGoals.length}` : `Achieved · ${achievedGoals.length}`}
            </button>
          ))}
        </div>

        {/* Quick Update — Active only */}
        {tab === "active" && activeGoals.length > 0 && (
          <>
            <div id="goals-quick-section" className="px-7 pt-5 pb-1 flex justify-between items-baseline">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                Quick Update
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">Step 01</span>
            </div>

            <div className="px-7">
              <div className="py-2 border-t border-border">
                <BottomSheetSelect
                  title="Select Goal"
                  options={activeGoals.map((g) => {
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

              {selectedGoal && (
                <div className="py-2 border-t border-border flex items-baseline justify-between">
                  <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground">
                    {Math.round(selectedPct * 100)}% complete · remaining
                  </span>
                  <CurrencyText value={selectedRemaining} className="font-mono text-[13px] text-foreground" />
                </div>
              )}

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

        {/* List header */}
        <div id="goals-list-header" className="px-7 pt-5 pb-1 flex justify-between items-baseline">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
            {tab === "active" ? `All Goals · ${activeGoals.length}` : `Achieved · ${achievedGoals.length}`}
          </span>
          {tab === "active" && (
            <button
              id="goals-add-btn"
              onClick={() => { haptic.light(); openAddSheet(); }}
              className="font-mono text-[10px] tracking-[0.14em] uppercase text-foreground underline underline-offset-2 decoration-foreground/30 hover:decoration-foreground transition-all"
            >
              + New
            </button>
          )}
        </div>

        <div className="px-7">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                Loading…
              </div>
            </div>
          ) : list.length === 0 ? (
            <div className="border border-border border-t-0 py-12 text-center">
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-3">
                {tab === "active" ? "No active goals" : "No achieved goals yet"}
              </div>
              {tab === "active" && (
                <button
                  onClick={() => { haptic.light(); openAddSheet(); }}
                  className="font-mono text-[10px] tracking-[0.14em] uppercase text-foreground underline underline-offset-2"
                >
                  Add your first goal →
                </button>
              )}
            </div>
          ) : (
            <div>
              {list.map((goal, i) => {
                const current = Number(goal.current_amount);
                const target = Number(goal.target_amount);
                const pct = target > 0 ? Math.min(1, current / target) : 0;
                const pctDisplay = Math.round(pct * 100);
                const num = String(i + 1).padStart(2, "0");
                const isAchieved = Boolean(goal.achieved_at);

                return (
                  <div
                    key={goal.id}
                    className="w-full text-left"
                    style={{
                      borderTop: i === 0 ? "1px solid var(--border)" : "none",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <button
                      type="button"
                      id={i === 0 ? "goals-goal-row-0" : undefined}
                      onClick={() => { haptic.light(); openEditSheet(goal); }}
                      className="w-full text-left"
                      disabled={isAchieved}
                    >
                      <div className="py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-[10px] text-muted-foreground shrink-0 tabular-nums">{num}</span>
                            <span className="text-lg grayscale shrink-0">{goal.icon || "🎯"}</span>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">{goal.name}</div>
                              {isAchieved && goal.achieved_at && (
                                <div className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">
                                  Achieved {new Date(goal.achieved_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                </div>
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
                    {!isAchieved && (
                      <div className="pb-3 -mt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => { haptic.heavy(); setConfirmAchieveId(goal.id); }}
                          className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Mark Achieved →
                        </button>
                      </div>
                    )}
                  </div>
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

      <ConfirmDrawer
        isOpen={Boolean(confirmAchieveId)}
        onClose={() => setConfirmAchieveId(null)}
        onConfirm={handleAchieveConfirm}
        title={confirmingGoal ? `Mark "${confirmingGoal.name}" achieved?` : "Mark achieved?"}
        description={
          confirmingGoal
            ? `This will withdraw ₹${Number(confirmingGoal.current_amount).toLocaleString("en-IN")} from net worth and archive the goal. Linked budget items lose their link.`
            : ""
        }
        confirmText="Mark Achieved"
        cancelText="Cancel"
      />
    </>
  );
}
