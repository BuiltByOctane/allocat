"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  OnboardingDeck,
  type DeckSlide,
} from "@/components/onboarding/OnboardingDeck";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";
import { TEACHING_SLIDES } from "@/components/onboarding/onboardingSlides";
import { FirstBudgetCard } from "@/components/onboarding/FirstBudgetCard";
import { DASHBOARD_KEY } from "@/lib/hooks/useDashboard";
import { getDashboardData } from "@/lib/actions/dashboard";

export default function OnboardingFlow() {
  const router = useRouter();
  const qc = useQueryClient();

  // Warm the dashboard route + data so landing after onboarding has no skeleton.
  useEffect(() => {
    router.prefetch("/dashboard");
    qc.prefetchQuery({
      queryKey: DASHBOARD_KEY,
      queryFn: () => getDashboardData(),
    }).catch(() => {});
  }, [router, qc]);

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
    { key: "setup", hideNext: true, content: <FirstBudgetCard /> },
  ];

  return <OnboardingDeck slides={slides} />;
}
