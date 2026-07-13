"use client";

import { useHaptic } from "@/lib/hooks/useHaptic";
import { QuizQuestionShell } from "../QuizQuestionShell";
import { QuizChip } from "../QuizChip";
import type { QuizAction, QuizAnswersState } from "../useQuizAnswers";
import type { OnboardingDeckHandle } from "../../OnboardingDeck";
import { TREAT_CHIPS } from "@/lib/budget/quizMapping";

export interface Q4TreatProps {
  answers: QuizAnswersState;
  dispatch: (action: QuizAction) => void;
  deckNav: OnboardingDeckHandle;
}

export function Q4Treat({ answers, dispatch, deckNav }: Q4TreatProps) {
  const haptic = useHaptic();

  return (
    <QuizQuestionShell
      eyebrow="Question 4 of 5"
      title="What's your can't-give-it-up treat?"
      reassurance="🐾 We'll protect a treat budget — always."
      onSkip={() => {
        haptic.selection();
        dispatch({ type: "SKIP_TREAT" });
        deckNav.next();
      }}
      footer={
        answers.treat.length > 0 ? (
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
        {TREAT_CHIPS.map((chip) => (
          <QuizChip
            key={chip.id}
            label={chip.label}
            active={answers.treat.includes(chip.id)}
            onToggle={() => {
              haptic.selection();
              dispatch({ type: "TOGGLE_TREAT", id: chip.id });
            }}
          />
        ))}
      </div>
    </QuizQuestionShell>
  );
}
