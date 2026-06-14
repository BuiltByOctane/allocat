"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { GoalDetailSheet } from "./GoalDetailSheet";
import type { GoalFormData } from "./GoalDetailSheet";
import { BottomSheetSelect } from "@/components/ui/BottomSheetSelect";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Progress } from "@/components/ui/Progress";
import { Card } from "@/components/ui/Card";
import { resolveColor } from "@/lib/theme/dataViz";
import { ConfirmDrawer } from "@/components/ui/ConfirmDrawer";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { CurrencySymbol } from "@/components/ui/CurrencySymbol";
import { useFormatCurrency } from "@/lib/hooks/useFormatCurrency";
import { useHaptic } from "@/lib/hooks/useHaptic";
import {
  useGoalsData,
  useAddGoal,
  useUpdateGoal,
  useDeleteGoal,
  useUpdateGoalIcon,
  useAchieveGoalAsset,
} from "@/lib/hooks/useGoals";
import { useEntitlement } from "@/lib/providers/EntitlementProvider";
import { usePaywallGate } from "@/lib/providers/PaywallProvider";
import { isAtLimit } from "@/lib/subscription/limits";

type GoalRow = {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  target_amount: number;
  current_amount: number;
  notes: string | null;
  priority: number;
  achieved_at: string | null;
  created_at: string;
  updated_at: string;
};

function SegBar({
  pct,
  color,
}: {
  pct: number;
  color?: string;
}) {
  return (
    <Progress value={pct * 100} color={color} className="mt-2.5 h-1.5" />
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
  const fmt = useFormatCurrency();

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

  const { tier } = useEntitlement();
  const paywallGate = usePaywallGate();

  useEffect(() => {
    if (activeGoals.length > 0 && !activeGoals.find((g) => g.id === quickGoalId)) {
      setQuickGoalId(activeGoals[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGoals.length]);

  function openAddSheet() {
    // Free tier: cap active goals. Premium (paid/trial) is unlimited.
    if (!paywallGate(isAtLimit("goals", activeGoals.length, tier), "goals")) {
      return;
    }
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
          color: formData.color,
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
      <div className="px-4 pt-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center gap-3 px-1 pt-1">
          <button
            onClick={() => { haptic.light(); router.back(); }}
            className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-foreground"
            aria-label="Back"
          >
            <ChevronLeft size={18} strokeWidth={1.9} />
          </button>
          <div>
            <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground">Goals</h1>
            <p className="text-[11px] font-medium text-muted-foreground mt-1">
              Tracked in Net Worth · {activeGoals.length} active · {achievedGoals.length} achieved
            </p>
          </div>
        </div>

        {/* Tabs */}
        <SegmentedControl
          variant="pill"
          options={[
            { label: "Active", value: "active", count: activeGoals.length },
            { label: "Achieved", value: "achieved", count: achievedGoals.length },
          ]}
          value={tab}
          onChange={setTab}
        />

        {/* Quick Update — Active only */}
        {tab === "active" && activeGoals.length > 0 && (
          <Card id="goals-quick-section">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                Quick Update
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">Select goal</span>
            </div>

            <div className="mt-2.5">
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
                className="flex w-full items-center justify-between rounded-[13px] border border-border bg-card px-3.5 py-3 text-sm font-bold text-foreground"
              />
            </div>

            {selectedGoal && (
              <div className="mt-2.5 flex items-baseline justify-between text-[11px] font-medium text-muted-foreground">
                <span>{Math.round(selectedPct * 100)}% complete · remaining</span>
                <CurrencyText value={selectedRemaining} className="text-foreground font-bold" />
              </div>
            )}

            <div className="mt-2.5 flex items-center gap-2.5">
              <div className="flex flex-1 items-baseline gap-1.5 rounded-[13px] border border-border bg-card px-3.5 py-3">
                <span className="currency-symbol text-muted-foreground text-base"><CurrencySymbol /></span>
                <input
                  type="number"
                  min="0"
                  value={quickAmount}
                  onChange={(e) => setQuickAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="Add amount"
                  className="bg-transparent border-none outline-none text-base font-bold text-foreground w-full p-0 tabular-nums placeholder:text-muted-foreground placeholder:font-medium"
                />
              </div>
              <button
                onClick={handleQuickUpdate}
                disabled={!quickAmount || parseFloat(quickAmount) < 0}
                className="h-[46px] shrink-0 rounded-pill bg-[var(--pill)] px-5 text-sm font-bold text-[var(--pill-foreground)] disabled:opacity-30 active:scale-95 transition-all"
              >
                Update
              </button>
            </div>
          </Card>
        )}

        {/* List header */}
        <div id="goals-list-header" className="flex items-center justify-between px-1 mt-1">
          <span className="font-display text-[15px] font-bold text-foreground">
            {tab === "active" ? `All Goals · ${activeGoals.length}` : `Achieved · ${achievedGoals.length}`}
          </span>
          {tab === "active" && (
            <button
              id="goals-add-btn"
              onClick={() => { haptic.light(); openAddSheet(); }}
              className="flex items-center gap-1 text-[13px] font-bold text-foreground"
            >
              <span className="text-accent-strong text-base leading-none">＋</span>New
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center">
            <div className="text-[11px] font-medium text-muted-foreground">Loading…</div>
          </div>
        ) : list.length === 0 ? (
          <Card className="py-10 text-center">
            <div className="text-[13px] font-medium text-muted-foreground mb-3">
              {tab === "active" ? "No active goals" : "No achieved goals yet"}
            </div>
            {tab === "active" && (
              <button
                onClick={() => { haptic.light(); openAddSheet(); }}
                className="text-[13px] font-bold text-foreground"
              >
                Add your first goal →
              </button>
            )}
          </Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {list.map((goal, i) => {
              const current = Number(goal.current_amount);
              const target = Number(goal.target_amount);
              const pct = target > 0 ? Math.min(1, current / target) : 0;
              const pctDisplay = Math.round(pct * 100);
              const isAchieved = Boolean(goal.achieved_at);

              return (
                <Card key={goal.id} compact>
                  <button
                    type="button"
                    id={i === 0 ? "goals-goal-row-0" : undefined}
                    onClick={() => { haptic.light(); openEditSheet(goal); }}
                    className="w-full text-left"
                    disabled={isAchieved}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-tile text-[17px]">
                        {goal.icon || "🎯"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-bold text-foreground truncate">{goal.name}</div>
                        {isAchieved && goal.achieved_at ? (
                          <div className="text-[10.5px] font-medium text-muted-foreground truncate mt-0.5">
                            Achieved {new Date(goal.achieved_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </div>
                        ) : (
                          <div className="text-[10.5px] font-medium text-muted-foreground tabular-nums mt-0.5">
                            <CurrencyText value={current} /> of <CurrencyText value={target} />
                          </div>
                        )}
                      </div>
                      <div className="figure text-[16px] shrink-0">{pctDisplay}%</div>
                    </div>
                    <SegBar pct={pct} color={resolveColor({ id: goal.id, color: goal.color })} />
                  </button>
                  {!isAchieved && (
                    <div className="mt-2.5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => { haptic.heavy(); setConfirmAchieveId(goal.id); }}
                        className="text-[12px] font-bold text-foreground"
                      >
                        Mark Achieved →
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <div className="h-28 md:h-12" />
      </div>

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
            ? `This will withdraw ${fmt(Number(confirmingGoal.current_amount))} from net worth and archive the goal. Linked budget items lose their link.`
            : ""
        }
        confirmText="Mark Achieved"
        cancelText="Cancel"
      />
    </>
  );
}
