import type { QuizPlan } from "@/lib/budget/quizMapping";

/**
 * Lightweight local persistence for a quiz plan the user built but didn't
 * save ("Not now — keep it for later"). Re-offered by FirstRunChecklist and
 * pre-filled into BudgetQuickSetup. Best-effort: never throws, no-ops on the
 * server (SSR) or when localStorage is unavailable.
 */

const DRAFT_KEY = "allocat-quiz-draft";

export interface QuizDraftItem {
  name: string;
  allocation: number;
}

export interface QuizDraftCategory {
  name: string;
  icon: string | null;
  allocation: number;
  items: QuizDraftItem[];
}

export interface QuizDraft {
  planName: string;
  total: number;
  categories: QuizDraftCategory[];
  createdAt: string;
}

export function saveDraftPlan(plan: QuizPlan): void {
  if (typeof window === "undefined") return;
  try {
    const draft: QuizDraft = {
      planName: plan.planName,
      total: plan.total,
      categories: plan.categories.map((c) => ({
        name: c.name,
        icon: c.icon,
        allocation: c.allocation,
        items: c.items.map((i) => ({ name: i.name, allocation: i.allocation })),
      })),
      createdAt: new Date().toISOString(),
    };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* best effort — a lost draft never blocks anything */
  }
}

export function readDraftPlan(): QuizDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as QuizDraft;
  } catch {
    return null;
  }
}

export function clearDraftPlan(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* best effort */
  }
}
