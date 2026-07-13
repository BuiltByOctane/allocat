"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AnimatedNumber } from "../../AnimatedNumber";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useFormatCurrency } from "@/lib/hooks/useFormatCurrency";
import { CurrencySymbol } from "@/components/ui/CurrencySymbol";
import { buildPlanFromAnswers, type QuizPlan } from "@/lib/budget/quizMapping";
import type { QuizAnswersState } from "../useQuizAnswers";

export interface RevealScreenProps {
  answers: QuizAnswersState;
  onSave: (plan: QuizPlan) => Promise<void>;
  onDiscard: (plan: QuizPlan) => Promise<void>;
}

/** Final quiz screen: shows the named, fully-allocated plan and lets the
 *  user save it or keep it for later. The plan is computed once on mount
 *  (empty dep array) - answers are already frozen by the time this, the
 *  quiz's last slide, mounts. */
export function RevealScreen({ answers, onSave, onDiscard }: RevealScreenProps) {
  const reduce = useReducedMotion();
  const haptic = useHaptic();
  const fmt = useFormatCurrency();
  const [busy, setBusy] = useState<"save" | "discard" | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => buildPlanFromAnswers(answers, () => crypto.randomUUID()), []);

  async function handleSave() {
    if (busy) return;
    haptic.success();
    setBusy("save");
    await onSave(plan);
  }

  async function handleDiscard() {
    if (busy) return;
    haptic.light();
    setBusy("discard");
    await onDiscard(plan);
  }

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto px-7 py-8 no-scrollbar">
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <span className="text-[11px] font-bold uppercase tracking-wide text-accent-strong">
          Your budget is ready
        </span>
        <h1 className="font-display text-[clamp(1.6rem,7vw,2.1rem)] font-bold leading-[1.1] tracking-tight text-white">
          {plan.planName}
        </h1>
        <p className="text-[12.5px] text-white/45">
          Made from your answers · {fmt(plan.total)}
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {plan.categories.map((cat, i) => (
          <motion.div
            key={cat.id}
            initial={reduce ? undefined : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : i * 0.12, duration: 0.4 }}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5"
          >
            <div>
              <div className="flex items-center gap-2 text-[14px] font-bold text-white">
                {cat.icon ? <span>{cat.icon}</span> : null}
                {cat.name}
              </div>
              <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-white/40">
                {cat.items.map((item) => item.name).join(" · ")}
              </div>
            </div>
            <span className="flex items-baseline gap-0.5 font-display text-[16px] font-extrabold tabular-nums text-white">
              <CurrencySymbol className="text-[12px] text-white/50" />
              <AnimatedNumber value={cat.allocation} />
            </span>
          </motion.div>
        ))}
      </div>

      <p className="text-center text-[12px] text-white/45">
        Nothing&apos;s locked — you can change any of this after.
      </p>

      <div className="mt-auto flex flex-col gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy !== null}
          className="w-full rounded-pill bg-accent py-4 text-sm font-bold text-[var(--accent-ink)] transition active:scale-[0.98] disabled:opacity-40"
        >
          {busy === "save" ? "Saving…" : "Save my budget"}
        </button>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={busy !== null}
          className="w-full py-2 text-xs font-bold uppercase tracking-widest text-white/45 transition hover:text-white/80 disabled:opacity-40"
        >
          {busy === "discard" ? "…" : "Not now — keep it for later"}
        </button>
      </div>
    </div>
  );
}
