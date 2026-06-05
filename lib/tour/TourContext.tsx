"use client";

import { createContext, useCallback, useEffect, useState } from "react";
import type { TourContextValue, TourPage, TourState } from "./types";

const STORAGE_KEY = "allocat-tour-state";
// New installs start un-asked → the upfront prompt decides `enabled`.
const DEFAULT_STATE: TourState = { asked: false, enabled: true, seenPages: [] };

function loadState(): TourState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<TourState>;
    return {
      // Pre-existing users (state saved before `asked` existed) are treated as
      // already-asked so they aren't re-prompted on upgrade.
      asked: parsed.asked ?? true,
      enabled: parsed.enabled ?? true,
      seenPages: parsed.seenPages ?? [],
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: TourState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export const TourContext = createContext<TourContextValue>({
  asked: false,
  enabled: true,
  seenPages: [],
  hydrated: false,
  isPageTourActive: () => false,
  markSeen: () => {},
  setEnabled: () => {},
  answerPrompt: () => {},
  resetTour: () => {},
});

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TourState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  const isPageTourActive = useCallback(
    (page: TourPage) => {
      if (!hydrated) return false;
      // Don't run any page tour until the user has opted in via the prompt.
      return state.asked && state.enabled && !state.seenPages.includes(page);
    },
    [state, hydrated]
  );

  const markSeen = useCallback((page: TourPage) => {
    setState((prev) => {
      if (prev.seenPages.includes(page)) return prev;
      const next: TourState = {
        ...prev,
        seenPages: [...prev.seenPages, page],
      };
      saveState(next);
      return next;
    });
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    setState((prev) => {
      const next: TourState = { ...prev, enabled };
      saveState(next);
      return next;
    });
  }, []);

  const answerPrompt = useCallback((wants: boolean) => {
    setState((prev) => {
      const next: TourState = { ...prev, asked: true, enabled: wants };
      saveState(next);
      return next;
    });
  }, []);

  const resetTour = useCallback(() => {
    setState((prev) => {
      // Re-ask on reset so the user can opt back in.
      const next: TourState = { ...prev, seenPages: [], asked: false };
      saveState(next);
      return next;
    });
  }, []);

  return (
    <TourContext.Provider
      value={{
        ...state,
        hydrated,
        isPageTourActive,
        markSeen,
        setEnabled,
        answerPrompt,
        resetTour,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}
