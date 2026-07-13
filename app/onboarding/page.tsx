"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  OnboardingDeck,
  type DeckSlide,
} from "@/components/onboarding/OnboardingDeck";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";
import { QuizInviteCard, TEACHING_SLIDES } from "@/components/onboarding/onboardingSlides";
import { QuizFlow } from "@/components/onboarding/quiz/QuizFlow";
import { markUserAsOnboarded } from "@/lib/actions/profile";
import { DASHBOARD_KEY } from "@/lib/hooks/useDashboard";
import { getDashboardData } from "@/lib/actions/dashboard";

export default function OnboardingFlow() {
  const router = useRouter();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"tour" | "quiz">("tour");

  // Warm the dashboard route + data so landing after onboarding has no skeleton.
  useEffect(() => {
    router.prefetch("/dashboard");
    // fetchQuery (not prefetchQuery): with staleTime:Infinity prefetchQuery skips
    // an already-cached key, serving a stale snapshot (see lib/db/prefetch.ts).
    qc.fetchQuery({
      queryKey: DASHBOARD_KEY,
      queryFn: () => getDashboardData(),
    }).catch(() => {});
  }, [router, qc]);

  async function skipToExplore() {
    try {
      await markUserAsOnboarded();
    } catch {
      /* flag is best-effort; dashboard is still reachable */
    }
    router.push("/dashboard");
  }

  if (mode === "quiz") {
    return <QuizFlow onDone={() => router.push("/dashboard")} />;
  }

  const slides: DeckSlide[] = [
    ...TEACHING_SLIDES.map((s) => ({
      key: s.key,
      content: (
        <OnboardingCard
          eyebrow={s.eyebrow}
          icon={s.icon}
          title={s.title}
          body={s.body}
          visual={s.visual}
        />
      ),
    })),
    {
      key: "invite",
      hideNext: true,
      content: (
        <QuizInviteCard onBuildBudget={() => setMode("quiz")} onSkip={skipToExplore} />
      ),
    },
  ];

  return <OnboardingDeck slides={slides} />;
}
