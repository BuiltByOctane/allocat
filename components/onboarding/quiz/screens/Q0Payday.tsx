"use client";

import { useState } from "react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { QuizQuestionShell } from "../QuizQuestionShell";
import { QuizOptionCard } from "../QuizOptionCard";
import type { QuizAction, QuizAnswersState } from "../useQuizAnswers";
import type { OnboardingDeckHandle } from "../../OnboardingDeck";
import { ordinal } from "@/lib/budget/cycleText";

export interface Q0PaydayProps {
  answers: QuizAnswersState;
  dispatch: (action: QuizAction) => void;
  deckNav: OnboardingDeckHandle;
}

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export function Q0Payday({ answers, dispatch, deckNav }: Q0PaydayProps) {
  const haptic = useHaptic();
  // Nothing is pre-selected: a new account must say which day (the 1st too).
  const [picking, setPicking] = useState(answers.payday !== null && answers.payday !== 1);

  function choose(payday: number) {
    haptic.selection();
    dispatch({ type: "SET_PAYDAY", payday });
    deckNav.next();
  }

  return (
    <QuizQuestionShell
      eyebrow="One last thing"
      title="When does your salary arrive?"
      reassurance="📅 Your budget month will start on this day."
      onSkip={() => {
        haptic.selection();
        dispatch({ type: "SKIP_PAYDAY" });
        deckNav.next();
      }}
    >
      <div className="flex flex-col gap-3">
        <QuizOptionCard
          label="1st of the month"
          active={!picking && answers.payday === 1}
          onSelect={() => choose(1)}
        />
        <QuizOptionCard
          label="Pick a date"
          active={picking}
          onSelect={() => {
            haptic.selection();
            setPicking(true);
          }}
        />
        <QuizOptionCard
          label="No fixed salary"
          active={false}
          onSelect={() => {
            haptic.selection();
            dispatch({ type: "SET_PAYDAY", payday: 1 });
            deckNav.next();
          }}
        />
        {picking ? (
          <div className="grid grid-cols-7 gap-2" role="group" aria-label="Salary day">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                aria-label={ordinal(d)}
                onClick={() => choose(d)}
                className={`rounded-xl py-2.5 text-[13px] font-bold tabular-nums transition-colors ${
                  answers.payday === d && !answers.paydaySkipped
                    ? "bg-accent text-[var(--accent-ink)]"
                    : "bg-white/[0.08] text-white active:bg-white/[0.14]"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </QuizQuestionShell>
  );
}
