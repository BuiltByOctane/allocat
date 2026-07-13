"use client";

import { useState } from "react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useFormatCurrency } from "@/lib/hooks/useFormatCurrency";
import { CurrencySymbol } from "@/components/ui/CurrencySymbol";
import { QuizQuestionShell } from "../QuizQuestionShell";
import type { QuizAction, QuizAnswersState } from "../useQuizAnswers";
import type { OnboardingDeckHandle } from "../../OnboardingDeck";
import { QUIZ_AMOUNT_ANCHORS } from "@/lib/budget/quizMapping";

export interface Q5AmountProps {
  answers: QuizAnswersState;
  dispatch: (action: QuizAction) => void;
  deckNav: OnboardingDeckHandle;
}

export function Q5Amount({ answers, dispatch, deckNav }: Q5AmountProps) {
  const haptic = useHaptic();
  const fmt = useFormatCurrency();
  const [value, setValue] = useState(
    answers.amountSkipped ? "" : String(answers.amount || "")
  );

  const totalNum = parseFloat(value) || 0;

  function commitAndAdvance() {
    haptic.selection();
    dispatch({ type: "SET_AMOUNT", amount: totalNum });
    deckNav.next();
  }

  return (
    <QuizQuestionShell
      eyebrow="Question 5 of 5"
      title="How much do you get to spend each month?"
      reassurance="🔒 Stays on your phone"
      onSkip={() => {
        haptic.selection();
        dispatch({ type: "SKIP_AMOUNT" });
        deckNav.next();
      }}
      footer={
        <button
          type="button"
          onClick={commitAndAdvance}
          disabled={totalNum <= 0}
          className="w-full rounded-pill bg-accent py-4 text-sm font-bold text-[var(--accent-ink)] transition active:scale-[0.98] disabled:opacity-30"
        >
          Build my budget ✨
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && totalNum > 0) commitAndAdvance();
            }}
            placeholder="e.g. 45000"
            min="0"
            className="w-full rounded-[16px] border-2 border-[var(--accent-strong)] bg-white/[0.03] pl-11 pr-4 py-5 text-[28px] font-bold text-white outline-none tabular-nums"
          />
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[24px] font-bold text-white/40">
            <CurrencySymbol />
          </span>
        </div>

        <div className="flex gap-2">
          {QUIZ_AMOUNT_ANCHORS.map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => {
                haptic.selection();
                setValue(String(amt));
              }}
              className="shrink-0 rounded-full bg-white/[0.08] px-3.5 py-2 text-[12.5px] font-bold text-white"
            >
              {fmt(amt)}
            </button>
          ))}
        </div>
      </div>
    </QuizQuestionShell>
  );
}
