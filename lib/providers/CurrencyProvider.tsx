"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useProfile } from "@/lib/hooks/useProfile";
import {
  DEFAULT_CURRENCY,
  getCurrencyDef,
  type CurrencyDef,
} from "@/lib/currency/catalog";

interface CurrencyContextValue {
  code: string;
  def: CurrencyDef;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { data: profile } = useProfile();
  const code = profile?.currency ?? DEFAULT_CURRENCY;

  const value = useMemo<CurrencyContextValue>(
    () => ({ code, def: getCurrencyDef(code) }),
    [code]
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (ctx) return ctx;
  // Fallback for components that mount outside the provider (auth, onboarding).
  return { code: DEFAULT_CURRENCY, def: getCurrencyDef(DEFAULT_CURRENCY) };
}
