"use client";

import { useReducer } from "react";
import {
  HABIT_DEFAULT,
  DREAM_DEFAULT,
  AMOUNT_DEFAULT,
  LIFE_DEFAULT,
  TREAT_DEFAULT,
  type HabitId,
  type DreamId,
  type ResolvedQuizAnswers,
} from "@/lib/budget/quizMapping";

/**
 * Quiz answer state. Every `*Skipped` flag is purely informational (e.g. for
 * analytics/debugging) - the answer fields themselves are ALWAYS populated
 * (with a neutral default on skip), so buildPlanFromAnswers never has to
 * special-case an unanswered question.
 */
export interface QuizAnswersState extends ResolvedQuizAnswers {
  habitSkipped: boolean;
  lifeSkipped: boolean;
  dreamSkipped: boolean;
  treatSkipped: boolean;
  amountSkipped: boolean;
}

const initialState: QuizAnswersState = {
  habit: HABIT_DEFAULT,
  habitSkipped: false,
  life: [],
  lifeSkipped: false,
  dream: DREAM_DEFAULT,
  dreamSkipped: false,
  treat: [],
  treatSkipped: false,
  amount: AMOUNT_DEFAULT,
  amountSkipped: false,
};

export type QuizAction =
  | { type: "SET_HABIT"; habit: HabitId }
  | { type: "SKIP_HABIT" }
  | { type: "TOGGLE_LIFE"; id: string }
  | { type: "SKIP_LIFE" }
  | { type: "SET_DREAM"; dream: DreamId }
  | { type: "SKIP_DREAM" }
  | { type: "TOGGLE_TREAT"; id: string }
  | { type: "SKIP_TREAT" }
  | { type: "SET_AMOUNT"; amount: number }
  | { type: "SKIP_AMOUNT" };

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((i) => i !== id) : [...list, id];
}

function reducer(state: QuizAnswersState, action: QuizAction): QuizAnswersState {
  switch (action.type) {
    case "SET_HABIT":
      return { ...state, habit: action.habit, habitSkipped: false };
    case "SKIP_HABIT":
      return { ...state, habit: HABIT_DEFAULT, habitSkipped: true };
    case "TOGGLE_LIFE":
      return { ...state, life: toggle(state.life, action.id) };
    case "SKIP_LIFE":
      return { ...state, life: LIFE_DEFAULT, lifeSkipped: true };
    case "SET_DREAM":
      return { ...state, dream: action.dream, dreamSkipped: false };
    case "SKIP_DREAM":
      return { ...state, dream: DREAM_DEFAULT, dreamSkipped: true };
    case "TOGGLE_TREAT":
      return { ...state, treat: toggle(state.treat, action.id) };
    case "SKIP_TREAT":
      return { ...state, treat: TREAT_DEFAULT, treatSkipped: true };
    case "SET_AMOUNT":
      return { ...state, amount: action.amount, amountSkipped: false };
    case "SKIP_AMOUNT":
      return { ...state, amount: AMOUNT_DEFAULT, amountSkipped: true };
    default:
      return state;
  }
}

export function useQuizAnswers() {
  return useReducer(reducer, initialState);
}
