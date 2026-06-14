"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useProfile } from "@/lib/hooks/useProfile";
import {
  getEntitlement,
  type Entitlement,
} from "@/lib/subscription/entitlement";

const EntitlementContext = createContext<Entitlement | null>(null);

/** Re-derive entitlement on this cadence so trial expiry / daysLeft flip without a reload. */
const TICK_MS = 60 * 1000;

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { data: profile } = useProfile();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const interval = setInterval(tick, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const entitlement = useMemo(
    () => getEntitlement(profile ?? null, now),
    [profile, now],
  );

  return (
    <EntitlementContext.Provider value={entitlement}>
      {children}
    </EntitlementContext.Provider>
  );
}

/**
 * Entitlement for the current user. Components outside the provider (auth,
 * onboarding) get a safe free-tier default.
 */
export function useEntitlement(): Entitlement {
  const ctx = useContext(EntitlementContext);
  if (ctx) return ctx;
  return getEntitlement(null);
}

/** Convenience: true when the user has premium access (paid or in trial). */
export function useIsPremium(): boolean {
  return useEntitlement().tier === "premium";
}
