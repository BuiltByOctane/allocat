"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Capacitor } from "@capacitor/core";
import { PaywallSheet } from "@/components/subscription/PaywallSheet";
import { useEntitlement } from "@/lib/providers/EntitlementProvider";
import { useStartTrial, useStartCheckout } from "@/lib/hooks/useSubscription";

interface PaywallContextValue {
  /** Open the paywall. `reason` (e.g. "goals", "ai") tailors the headline. */
  open: (reason?: string) => void;
  close: () => void;
}

const PaywallContext = createContext<PaywallContextValue | null>(null);

export function PaywallProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>(undefined);

  const entitlement = useEntitlement();
  const startTrial = useStartTrial();
  const checkout = useStartCheckout();
  const isNative = Capacitor.isNativePlatform();

  const open = useCallback((r?: string) => {
    setReason(r);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo<PaywallContextValue>(() => ({ open, close }), [open, close]);

  return (
    <PaywallContext.Provider value={value}>
      {children}
      <PaywallSheet
        isOpen={isOpen}
        onClose={close}
        entitlement={entitlement}
        isNative={isNative}
        reason={reason}
        starting={startTrial.isPending}
        onStartTrial={() => {
          startTrial.mutate(undefined, { onSuccess: () => setIsOpen(false) });
        }}
        onCheckout={(plan) => checkout.mutate(plan)}
      />
    </PaywallContext.Provider>
  );
}

export function usePaywall(): PaywallContextValue {
  const ctx = useContext(PaywallContext);
  if (ctx) return ctx;
  // No-op fallback for components mounted outside the provider.
  return { open: () => {}, close: () => {} };
}

/**
 * Gate a count-limited action. Returns a function that, when the free user is at
 * the cap, opens the paywall and returns false (caller should abort); otherwise
 * returns true (proceed).
 */
export function usePaywallGate() {
  const { open } = usePaywall();
  return useCallback(
    (atLimit: boolean, reason: string): boolean => {
      if (atLimit) {
        open(reason);
        return false;
      }
      return true;
    },
    [open],
  );
}
