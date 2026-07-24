"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useSync } from "@/lib/hooks/useSync";
import { getDB } from "@/lib/db";
import { findCarrySource, isEmptyBudget } from "@/lib/budget/carry";
import { pickBudgetReminderMessage } from "@/lib/notify/messages";
import { notifyLocal } from "@/lib/native/notify";

/**
 * New-month nudge: if the CURRENT month has no budget set AND there's no prior
 * budget to auto-carry from (so CarryController won't silently fill it), post a
 * single cat-voice local notification telling the user to set one up.
 *
 * Native only — web has no local-notification channel (notifyLocal no-ops there,
 * and we don't want to burn the once-per-month flag on a notif nobody sees).
 * Deduped per month via localStorage, re-checked on visibilitychange so a
 * month rollover while the app stays open still fires. Mounted once in
 * app/(app)/layout.tsx.
 */
export function BudgetReminderController() {
  const { isHydrated } = useSync();

  useEffect(() => {
    if (!isHydrated) return;
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;

    const check = async () => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const flagKey = `allocat-budget-reminder:${year}-${month}`;
      if (typeof window === "undefined") return;
      if (localStorage.getItem(flagKey)) return;

      const db = getDB();
      const budgets = await db.budgets.toArray();
      const counts = new Map<string, number>();
      for (const b of budgets) {
        counts.set(
          b.id,
          await db.categories.where("budget_id").equals(b.id).count(),
        );
      }
      if (cancelled) return;

      // Something to auto-carry → CarryController fills this month, no nudge.
      if (findCarrySource(budgets, counts, { month, year })) return;

      // Is the current month actually empty?
      const current = budgets.find(
        (b) => b.month === month && b.year === year,
      );
      const empty =
        !current ||
        isEmptyBudget({
          totalBudget: Number(current.total_budget) || 0,
          categories: Array.from({
            length: counts.get(current.id) ?? 0,
          }),
        });
      if (!empty) return;

      // Set the flag first so a re-fire (visibilitychange) can't double-notify.
      localStorage.setItem(flagKey, "1");
      const msg = pickBudgetReminderMessage(`${year}-${month}`);
      await notifyLocal({ title: msg.title, body: msg.body, url: "/budget" });
    };

    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isHydrated]);

  return null;
}
