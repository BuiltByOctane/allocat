"use client";

import { useHaptic } from "@/lib/hooks/useHaptic";
import { QuizQuestionShell } from "../QuizQuestionShell";
import { QuizOptionCard } from "../QuizOptionCard";
import type { QuizAction, QuizAnswersState } from "../useQuizAnswers";
import type { OnboardingDeckHandle } from "../../OnboardingDeck";
import type { DreamId } from "@/lib/budget/quizMapping";

const OPTIONS: { id: DreamId; label: string }[] = [
  { id: "emergency-fund", label: "🛟 Money in the bank for emergencies" },
  { id: "trip", label: "✈️ A trip I've been putting off" },
  { id: "big-purchase", label: "📱 Something big — phone, bike, laptop" },
  { id: "no-stress", label: "😌 Just no more month-end stress" },
];

export interface Q3DreamProps {
  answers: QuizAnswersState;
  dispatch: (action: QuizAction) => void;
  deckNav: OnboardingDeckHandle;
}

export function Q3Dream({ answers, dispatch, deckNav }: Q3DreamProps) {
  const haptic = useHaptic();

  function select(id: DreamId) {
    haptic.selection();
    dispatch({ type: "SET_DREAM", dream: id });
    deckNav.next();
  }

  return (
    <QuizQuestionShell
      eyebrow="Question 3 of 5"
      title="Six months from now, what would feel amazing?"
      reassurance="Your plan gets named after this ✨"
      onSkip={() => {
        haptic.selection();
        dispatch({ type: "SKIP_DREAM" });
        deckNav.next();
      }}
    >
      {OPTIONS.map((o) => (
        <QuizOptionCard
          key={o.id}
          label={o.label}
          active={!answers.dreamSkipped && answers.dream === o.id}
          onSelect={() => select(o.id)}
        />
      ))}
    </QuizQuestionShell>
  );
}
