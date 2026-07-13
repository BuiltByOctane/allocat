"use client";

import { useHaptic } from "@/lib/hooks/useHaptic";
import { QuizQuestionShell } from "../QuizQuestionShell";
import { QuizChip } from "../QuizChip";
import type { QuizAction, QuizAnswersState } from "../useQuizAnswers";
import type { OnboardingDeckHandle } from "../../OnboardingDeck";
import { LIFE_CHIPS } from "@/lib/budget/quizMapping";

export interface Q2LifeProps {
  answers: QuizAnswersState;
  dispatch: (action: QuizAction) => void;
  deckNav: OnboardingDeckHandle;
}

export function Q2Life({ answers, dispatch, deckNav }: Q2LifeProps) {
  const haptic = useHaptic();

  return (
    <QuizQuestionShell
      eyebrow="Question 2 of 5"
      title="What do you pay for every month?"
      reassurance="Tap everything that sounds like you"
      onSkip={() => {
        haptic.selection();
        dispatch({ type: "SKIP_LIFE" });
        deckNav.next();
      }}
      footer={
        answers.life.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              haptic.selection();
              deckNav.next();
            }}
            className="w-full rounded-pill bg-accent py-4 text-sm font-bold text-[var(--accent-ink)] transition active:scale-[0.98]"
          >
            Next
          </button>
        ) : null
      }
    >
      <div className="flex flex-wrap gap-2">
        {LIFE_CHIPS.map((chip) => (
          <QuizChip
            key={chip.id}
            label={chip.label}
            active={answers.life.includes(chip.id)}
            onToggle={() => {
              haptic.selection();
              dispatch({ type: "TOGGLE_LIFE", id: chip.id });
            }}
          />
        ))}
      </div>
    </QuizQuestionShell>
  );
}
