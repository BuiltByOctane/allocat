export type TourPage =
  | "dashboard"
  | "budget"
  | "goals"
  | "debt"
  | "net-worth"
  | "activity";

export interface TourState {
  /** Whether the user has answered the upfront "want a tour?" prompt yet. */
  asked: boolean;
  enabled: boolean;
  seenPages: TourPage[];
}

export interface TourContextValue extends TourState {
  /** True once localStorage has been read (avoids prompt flashing pre-hydration). */
  hydrated: boolean;
  isPageTourActive: (page: TourPage) => boolean;
  markSeen: (page: TourPage) => void;
  setEnabled: (enabled: boolean) => void;
  /** Answer the upfront prompt: enables or disables the tour, marks it asked. */
  answerPrompt: (wants: boolean) => void;
  resetTour: () => void;
}
