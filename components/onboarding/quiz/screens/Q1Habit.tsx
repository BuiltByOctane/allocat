"use client";

import { useHaptic } from "@/lib/hooks/useHaptic";
import { QuizQuestionShell } from "../QuizQuestionShell";
import { QuizOptionCard } from "../QuizOptionCard";
import type { QuizAction, QuizAnswersState } from "../useQuizAnswers";
import type { OnboardingDeckHandle } from "../../OnboardingDeck";
import type { HabitId } from "@/lib/budget/quizMapping";

const OPTIONS: { id: HabitId; label: string }[] = [
  { id: "no-savings", label: "😅 It just… goes. Not sure where." },
  { id: "bills-first", label: "🧾 Big bills first, the rest disappears" },
  { id: "save-first", label: "🐿️ I put some aside before spending" },
];

export interface Q1HabitProps {
  answers: QuizAnswersState;
  dispatch: (action: QuizAction) => void;
  deckNav: OnboardingDeckHandle;
}

export function Q1Habit({ answers, dispatch, deckNav }: Q1HabitProps) {
  const haptic = useHaptic();

  function select(id: HabitId) {
    haptic.selection();
    dispatch({ type: "SET_HABIT", habit: id });
    deckNav.next();
  }

  return (
    <QuizQuestionShell
      eyebrow="Question 1 of 5"
      title="Where does your money usually go?"
      reassurance="Be honest — no one's judging 🐱"
      onSkip={() => {
        haptic.selection();
        dispatch({ type: "SKIP_HABIT" });
        deckNav.next();
      }}
    >
      {OPTIONS.map((o) => (
        <QuizOptionCard
          key={o.id}
          label={o.label}
          active={!answers.habitSkipped && answers.habit === o.id}
          onSelect={() => select(o.id)}
        />
      ))}
    </QuizQuestionShell>
  );
}
