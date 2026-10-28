"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { liveQuery } from "dexie";
import { Drawer as DrawerPrimitive } from "vaul";
import { useQueryClient } from "@tanstack/react-query";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/Button";
import { getDB } from "@/lib/db";
import { forceRefreshTable } from "@/lib/db/hydrate";
import { getStartDayChoiceIDB, getStoredPeriodsIDB } from "@/lib/budget/periodIDB";
import {
  clampStartDay,
  planStartDaySwitch,
  toISODate,
  type StoredBudgetPeriod,
} from "@/lib/budget/period";
import { absorbedWarning, cycleRangeText, switchPreviewText } from "@/lib/budget/cycleText";
import { setBudgetStartDay } from "@/lib/actions/budget-cycle";
import { CURRENT_PERIOD_KEY } from "@/lib/hooks/useCurrentPeriod";
import { PROFILE_KEY } from "@/lib/hooks/useProfile";
import { DASHBOARD_KEY } from "@/lib/hooks/useDashboard";
import { SMS_CATEGORIZED_KEY } from "@/lib/hooks/useSmsTransactions";
import { ALLOCATE_PICKER_KEY } from "@/lib/hooks/useAllocatePicker";
import { pushSmsMirrorToNative } from "@/lib/sms/nativeMirror";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { track } from "@/lib/analytics/client";

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
/**
 * Best-effort pull of the rows the preview depends on, then read them from IDB.
 * Another device may have created budgets this one hasn't seen; the server's
 * mismatch guard is the backstop if the pull fails.
 */
interface Loaded {
  /** The stored choice; null = never chosen (plans from the effective day 1). */
  choice: number | null;
  budgets: StoredBudgetPeriod[];
}

async function loadFresh(): Promise<Loaded> {
  await Promise.all([forceRefreshTable("budgets"), forceRefreshTable("profiles")]).catch((e) =>
    console.warn("Budget cycle preview refresh failed:", e),
  );
  const [choice, budgets] = await Promise.all([getStartDayChoiceIDB(), getStoredPeriodsIDB()]);
  return { choice, budgets };
}

function countQueued(): Promise<number> {
  return getDB().sync_queue.where("status").anyOf("pending", "processing").count();
}

const SYNC_BLOCK_COPY = "Syncing your changes — try again in a moment.";
const OFFLINE_COPY = "You're offline. Connect to the internet to change your budget cycle.";

interface BudgetCycleSheetProps {
  open: boolean;
  onClose: () => void;
  /** Opened from inside another vaul drawer (BudgetSetupSheet). */
  nested?: boolean;
  /**
   * The first-time pick before a new account's first budget (see
   * `useStartDayGate`): onboarding's question as the title, and if the fresh
   * profile turns out to hold a day already (chosen on another device) the
   * sheet skips straight to `onSaved` without asking.
   */
  firstTime?: boolean;
  /**
   * Called once the day is stored and the current-period query has re-read
   * IDB, right before `onClose` — the caller resumes what the pick gated.
   */
  onSaved?: () => void;
}

/**
 * Change the budget-cycle start day (1–28). The preview is computed from IDB;
 * Save runs the server action directly (never queued, never optimistic) and
 * then re-pulls the affected tables.
 */
export function BudgetCycleSheet({
  open,
  onClose,
  nested = false,
  firstTime = false,
  onSaved,
}: BudgetCycleSheetProps) {
  const onOpenChange = (o: boolean) => {
    if (!o) onClose();
  };
  const content = (
    <DrawerContent className="max-h-[90dvh]">
      <CycleSheetBody onClose={onClose} firstTime={firstTime} onSaved={onSaved} />
    </DrawerContent>
  );
  if (nested) {
    return (
      <DrawerPrimitive.NestedRoot open={open} onOpenChange={onOpenChange} repositionInputs={false}>
        {content}
      </DrawerPrimitive.NestedRoot>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {content}
    </Drawer>
  );
}

/** Mounted only while the sheet is open, so every open starts fresh. */
function CycleSheetBody({
  onClose,
  firstTime,
  onSaved,
}: {
  onClose: () => void;
  firstTime: boolean;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const haptic = useHaptic();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest callbacks for the async load below (it must not re-run on re-render).
  const callbacks = useRef({ onClose, onSaved });
  useEffect(() => {
    callbacks.current = { onClose, onSaved };
  });

  useEffect(() => {
    let cancelled = false;
    void loadFresh().then(async (fresh) => {
      if (cancelled) return;
      if (firstTime && fresh.choice !== null) {
        // Already chosen (another device / a lagging cache): never ask again.
        await qc.invalidateQueries({ queryKey: CURRENT_PERIOD_KEY });
        if (cancelled) return;
        callbacks.current.onSaved?.();
        callbacks.current.onClose();
        return;
      }
      setLoaded(fresh);
    });
    return () => {
      cancelled = true;
    };
  }, [firstTime, qc]);

  // A queued op could target a budget the switch deletes — wait for the drain.
  useEffect(() => {
    const sub = liveQuery(countQueued).subscribe({
      next: (n) => setSyncBusy(n > 0),
      error: () => setSyncBusy(false),
    });
    return () => sub.unsubscribe();
  }, []);

  // Unchosen ⇒ no day is pre-selected or marked current: the user picks one.
  const current = loaded?.choice ?? null;
  const unchosen = loaded !== null && loaded.choice === null;
  const selected = picked ?? current;

  const plan = useMemo(() => {
    if (!loaded || selected === null) return null;
    return planStartDaySwitch({
      today: toISODate(new Date()),
      oldStartDay: clampStartDay(loaded.choice),
      newStartDay: selected,
      budgets: loaded.budgets,
    });
  }, [loaded, selected]);
  // A first-time pick is saveable even when it changes no budget (the 1st).
  const canSave = selected !== null && (plan !== null || unchosen);

  const save = async () => {
    if (!canSave || selected === null || syncBusy || saving) return;
    setError(null);
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError(OFFLINE_COPY);
      return;
    }
    haptic.light();
    setSaving(true);
    try {
      // The liveQuery can lag a just-enqueued op; check the queue at click time.
      if ((await countQueued()) > 0) {
        setSyncBusy(true);
        return;
      }
      const res = await setBudgetStartDay(selected, toISODate(new Date()), {
        deleteBudgetIds: plan?.deleteBudgetIds ?? [],
        currentEnd: plan?.current?.end ?? null,
      });
      if (!res.ok) {
        // Server saw budgets this preview didn't: re-pull and re-preview.
        if (res.stale) setLoaded(await loadFresh());
        setError(res.error);
        return;
      }
      // Deleted budgets cascade server-side; the id sweep removes them locally.
      // The switch already succeeded — a failed pull is retried by the next
      // reconcile, so it must not surface as a failed save.
      await Promise.all([
        forceRefreshTable("profiles"),
        forceRefreshTable("budgets"),
        forceRefreshTable("categories"),
        forceRefreshTable("budget_items"),
        forceRefreshTable("sms_transactions"),
      ]).catch((e) => console.warn("Budget cycle refresh failed:", e));
      // The current period first and awaited: a resumed create (onSaved) must
      // see the cycle under the new day.
      await qc.invalidateQueries({ queryKey: CURRENT_PERIOD_KEY }).catch(() => {});
      for (const queryKey of [
        PROFILE_KEY,
        DASHBOARD_KEY,
        ["budget"],
        ["report-range"],
        ["report-summary"],
        SMS_CATEGORIZED_KEY,
        ALLOCATE_PICKER_KEY,
      ]) {
        void qc.invalidateQueries({ queryKey });
      }
      void pushSmsMirrorToNative();
      track("budget_cycle_changed");
      onSaved?.();
      onClose();
    } catch {
      setError("Couldn't reach AlloCat. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  let preview: ReactNode = null;
  if (!loaded) {
    preview = (
      <div className="rounded-2xl bg-tile px-4 py-3 text-[12.5px] font-medium text-muted-foreground animate-pulse">
        Checking your budgets…
      </div>
    );
  } else if (!plan && unchosen && selected !== null) {
    preview = (
      <div className="rounded-2xl bg-tile px-4 py-3">
        <p className="text-[12.5px] font-medium leading-snug text-foreground">
          Your budgets will run {cycleRangeText(selected)}.
        </p>
      </div>
    );
  } else if (plan) {
    const cur = plan.current;
    preview = (
      <div className="rounded-2xl bg-tile px-4 py-3 space-y-1.5">
        <p className="text-[12.5px] font-medium leading-snug text-foreground">{switchPreviewText(plan)}</p>
        {cur &&
          plan.deleteLabels.map((l) => (
            <p
              key={`${l.year}-${l.month}`}
              className="flex items-start gap-1.5 text-[12px] font-semibold leading-snug text-neg"
            >
              <span className="material-symbols-outlined text-[16px] leading-[18px]">warning</span>
              {absorbedWarning(l, cur)}
            </p>
          ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto overscroll-contain">
      <DrawerHeader className="text-left">
        <DrawerTitle>{firstTime ? "When does your salary arrive?" : "Budget cycle"}</DrawerTitle>
        <DrawerDescription>
          {firstTime
            ? "Your budget will start on this day. You can change it later in Profile."
            : "Pick the day each budget starts — usually your payday."}
        </DrawerDescription>
      </DrawerHeader>

      <div className="px-4 pb-6 space-y-4">
        <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Budget start day">
          {DAYS.map((d) => {
            const isSelected = d === selected;
            const isCurrent = d === current;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={!loaded || saving}
                onClick={() => {
                  haptic.light();
                  setError(null);
                  setPicked(d);
                }}
                className={`relative flex aspect-square items-center justify-center rounded-[11px] text-[13px] font-bold transition-all active:scale-95 disabled:opacity-50 ${
                  isSelected
                    ? "bg-accent text-[var(--accent-ink)]"
                    : isCurrent
                      ? "bg-tile text-foreground ring-1 ring-foreground/40"
                      : "bg-tile text-muted-foreground"
                }`}
              >
                <span className="figure">{d}</span>
                {isCurrent && (
                  <span
                    aria-hidden
                    className={`absolute bottom-1 size-1 rounded-full ${
                      isSelected ? "bg-[var(--accent-ink)]" : "bg-foreground"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {preview}

        {syncBusy && canSave && (
          <p className="text-[12px] font-medium text-muted-foreground">{SYNC_BLOCK_COPY}</p>
        )}
        {error && <p className="text-[12px] font-semibold text-neg">{error}</p>}

        <Button
          variant="lime"
          block
          loading={saving}
          disabled={!canSave || syncBusy || saving}
          onClick={() => void save()}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

export default BudgetCycleSheet;
