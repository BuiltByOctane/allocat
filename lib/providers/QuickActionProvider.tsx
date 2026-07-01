"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";

export type QuickActionIcon = LucideIcon | "paw";

export interface QuickAction {
  /** Stable route key, e.g. "budget". Used to dedupe register/unregister. */
  id: string;
  /** aria-label for the dock button. */
  label: string;
  /** "paw" → PawLogo; otherwise a Lucide icon component. */
  icon: QuickActionIcon;
  /** Called when the dock button is tapped. Must NOT fire haptic (dock owns it). */
  onTrigger: () => void;
}

interface QuickActionContextValue {
  action: QuickAction | null;
  register: (action: QuickAction) => void;
  unregister: (id: string) => void;
}

const QuickActionContext = createContext<QuickActionContextValue | null>(null);

/**
 * Whether the subtree owns the visible slot. Defaults to `true` (web/desktop
 * render one page at a time). The native TabPager keeps several tab screens
 * mounted at once, so it wraps each pane and sets this `false` for off-screen
 * panes — otherwise every mounted screen's `useRegisterQuickAction` would race
 * and a background pane could win the dock. See TabPager.
 */
const QuickActionActiveContext = createContext<boolean>(true);

export function QuickActionActiveProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <QuickActionActiveContext.Provider value={active}>
      {children}
    </QuickActionActiveContext.Provider>
  );
}

export function QuickActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<QuickAction | null>(null);

  const register = useCallback((next: QuickAction) => {
    setAction(next);
  }, []);

  // Only clear if the unmounting page still owns the current action — guards
  // against a stale unregister clobbering the next route's registration.
  const unregister = useCallback((id: string) => {
    setAction((cur) => (cur?.id === id ? null : cur));
  }, []);

  return (
    <QuickActionContext.Provider value={{ action, register, unregister }}>
      {children}
    </QuickActionContext.Provider>
  );
}

export function useQuickAction(): QuickActionContextValue {
  const ctx = useContext(QuickActionContext);
  if (!ctx) {
    throw new Error("useQuickAction must be used within a QuickActionProvider");
  }
  return ctx;
}

/**
 * Register a route's quick action. Pass `null` to register nothing (dock hides).
 *
 * Callers MUST pass a stable `onTrigger` (wrap in useCallback) and a stable
 * icon reference (Lucide icons are module-level constants) — otherwise the
 * effect re-registers every render.
 */
export function useRegisterQuickAction(action: QuickAction | null) {
  const ctx = useContext(QuickActionContext);
  const active = useContext(QuickActionActiveContext);
  const register = ctx?.register;
  const unregister = ctx?.unregister;

  const id = action?.id;
  const label = action?.label;
  const icon = action?.icon;
  const onTrigger = action?.onTrigger;

  useEffect(() => {
    // Off-screen panes (native pager neighbours) stay mounted but must not
    // claim the dock — only the visible pane registers.
    if (!active) return;
    if (!register || !unregister || !id || !label || !icon || !onTrigger) return;
    register({ id, label, icon, onTrigger });
    return () => unregister(id);
  }, [active, register, unregister, id, label, icon, onTrigger]);
}
