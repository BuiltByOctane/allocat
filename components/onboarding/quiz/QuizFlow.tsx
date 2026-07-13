"use client";

import { useMemo, useRef } from "react";
import { OnboardingDeck, type DeckSlide, type OnboardingDeckHandle } from "../OnboardingDeck";
import { useQuizAnswers } from "./useQuizAnswers";
import { Q1Habit } from "./screens/Q1Habit";
import { Q2Life } from "./screens/Q2Life";
import { Q3Dream } from "./screens/Q3Dream";
import { Q4Treat } from "./screens/Q4Treat";
import { Q5Amount } from "./screens/Q5Amount";
import { RevealScreen } from "./screens/RevealScreen";
import { quizPlanToServerCategories, type QuizPlan } from "@/lib/budget/quizMapping";
import { saveDraftPlan } from "@/lib/budget/quizDraft";
import { getBudgetForPeriod, setupBudgetFromTemplate } from "@/lib/actions/budget";
import { markUserAsOnboarded } from "@/lib/actions/profile";

export interface QuizFlowProps {
  /** Called once the user has either saved, deferred, or otherwise completed
   *  the quiz - navigates on to the dashboard. */
  onDone: () => void;
}

/**
 * The 60-second onboarding quiz: 5 questions + a reveal, replacing the old
 * template-picker slide. Runs outside the app shell (no IDB/SyncProvider,
 * same constraint as the deleted FirstBudgetCard) - the save path below calls
 * the raw server actions directly rather than useSetupBudget/useEnsureBudgetRow,
 * which assume a mounted SyncEngine to drain their offline queue.
 */
export function QuizFlow({ onDone }: QuizFlowProps) {
  const [answers, dispatch] = useQuizAnswers();
  const deckRef = useRef<OnboardingDeckHandle>(null);

  // Stable proxy so screens can call deckNav.next()/.back() before the deck
  // ref has attached without needing a null check at every call site.
  const deckNav = useMemo<OnboardingDeckHandle>(
    () => ({
      next: () => deckRef.current?.next(),
      back: () => deckRef.current?.back(),
      goTo: (i: number) => deckRef.current?.goTo(i),
    }),
    []
  );

  async function handleSave(plan: QuizPlan) {
    try {
      const now = new Date();
      const budget = await getBudgetForPeriod(now.getMonth() + 1, now.getFullYear());
      await setupBudgetFromTemplate(
        budget.id,
        plan.total,
        quizPlanToServerCategories(plan),
        null
      );
    } catch {
      /* best-effort — a network hiccup must never trap the user on onboarding */
    }
    try {
      await markUserAsOnboarded();
    } catch {
      /* flag is best-effort; dashboard is still reachable */
    }
    onDone();
  }

  async function handleDiscard(plan: QuizPlan) {
    saveDraftPlan(plan);
    try {
      await markUserAsOnboarded();
    } catch {
      /* flag is best-effort; dashboard is still reachable */
    }
    onDone();
  }

  const slides: DeckSlide[] = [
    { key: "q1", hideNext: true, content: <Q1Habit answers={answers} dispatch={dispatch} deckNav={deckNav} /> },
    { key: "q2", hideNext: true, content: <Q2Life answers={answers} dispatch={dispatch} deckNav={deckNav} /> },
    { key: "q3", hideNext: true, content: <Q3Dream answers={answers} dispatch={dispatch} deckNav={deckNav} /> },
    { key: "q4", hideNext: true, content: <Q4Treat answers={answers} dispatch={dispatch} deckNav={deckNav} /> },
    { key: "q5", hideNext: true, content: <Q5Amount answers={answers} dispatch={dispatch} deckNav={deckNav} /> },
    {
      key: "reveal",
      hideNext: true,
      content: <RevealScreen answers={answers} onSave={handleSave} onDiscard={handleDiscard} />,
    },
  ];

  return <OnboardingDeck ref={deckRef} slides={slides} showSkipToEnd={false} />;
}
