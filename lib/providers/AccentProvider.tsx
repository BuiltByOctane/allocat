"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  isAccentId,
  type AccentId,
} from "@/lib/theme/accents";

interface AccentContextValue {
  accent: AccentId;
  setAccent: (id: AccentId) => void;
  /** False during SSR / first paint — guards against flashing the default. */
  hydrated: boolean;
}

const AccentContext = createContext<AccentContextValue>({
  accent: DEFAULT_ACCENT,
  setAccent: () => {},
  hydrated: false,
});

/**
 * Applies `data-accent` to <html> for the picker UI. The no-flash initial paint
 * is handled by a blocking script in app/layout.tsx — this provider only mirrors
 * and mutates that attribute, persisting the choice to localStorage. Lime is the
 * default: the attribute is removed so CSS falls back to :root/.light/.dark.
 */
export function AccentProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentId>(DEFAULT_ACCENT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // The blocking script already set dataset.accent before paint; read it back.
    const current = document.documentElement.dataset.accent;
    setAccentState(isAccentId(current) ? current : DEFAULT_ACCENT);
    setHydrated(true);
  }, []);

  const setAccent = useCallback((id: AccentId) => {
    setAccentState(id);
    try {
      if (id === DEFAULT_ACCENT) {
        delete document.documentElement.dataset.accent;
        localStorage.removeItem(ACCENT_STORAGE_KEY);
      } else {
        document.documentElement.dataset.accent = id;
        localStorage.setItem(ACCENT_STORAGE_KEY, id);
      }
    } catch {
      // ignore — attribute is still applied in-memory for this session
    }
  }, []);

  return (
    <AccentContext.Provider value={{ accent, setAccent, hydrated }}>
      {children}
    </AccentContext.Provider>
  );
}

export function useAccent() {
  return useContext(AccentContext);
}
