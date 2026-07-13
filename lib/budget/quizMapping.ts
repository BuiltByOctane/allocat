import type { BudgetTemplate } from "@/lib/budget-templates";
import { templateToSetupCategories, type SetupCategory } from "@/lib/budget/setupMath";
import { suggestItemNames } from "@/lib/budget/categorySuggestions";

/**
 * Onboarding-quiz answer → budget-plan mapping. Pure and testable (id
 * generation injected), mirroring setupMath.ts's style. The quiz never
 * invents new allocation math — it builds a 3-category pseudo-template and
 * hands it to the existing templateToSetupCategories for real rupee amounts.
 */

export type HabitId = "no-savings" | "bills-first" | "save-first";
export type DreamId = "emergency-fund" | "trip" | "big-purchase" | "no-stress";

export const HABIT_DEFAULT: HabitId = "bills-first";
export const DREAM_DEFAULT: DreamId = "no-stress";
export const AMOUNT_DEFAULT = 45000;

/** Anchor amounts for the Q5 amount screen (per the reviewed design doc). */
export const QUIZ_AMOUNT_ANCHORS = [25000, 45000, 70000];

export const LIFE_DEFAULT: string[] = ["rent", "groceries", "getting-to-work"];
export const TREAT_DEFAULT: string[] = ["food-delivery"];

/** Never let the treat/life mix squeeze Fun money below this % of the total. */
export const FUN_MONEY_FLOOR_PCT = 10;

export interface SplitRatio {
  needsPct: number; // "Must-pays"
  wantsPct: number; // "Fun money"
  savingsPct: number; // the goal category named per Q3
}

/** Q1 (habit) → split ratio. Mirrors the shipped 50/30/20 shape with two
 *  named variants either side. */
export const SPLIT_RATIOS: Record<HabitId, SplitRatio> = {
  "no-savings": { needsPct: 45, wantsPct: 35, savingsPct: 20 },
  "bills-first": { needsPct: 50, wantsPct: 30, savingsPct: 20 },
  "save-first": { needsPct: 45, wantsPct: 25, savingsPct: 30 },
};

export interface LifeChip {
  id: string;
  label: string;
  bucket: "must-pays" | "fun-money";
  itemName: string;
}

/** Q2 (life) chip catalogue — plain language only, never category jargon. */
export const LIFE_CHIPS: LifeChip[] = [
  { id: "rent", label: "🏠 Rent", bucket: "must-pays", itemName: "Rent / EMI" },
  { id: "food-delivery", label: "🍜 Food delivery", bucket: "fun-money", itemName: "Food Delivery" },
  { id: "getting-to-work", label: "🚇 Getting to work", bucket: "must-pays", itemName: "Transport" },
  { id: "money-for-family", label: "👨‍👩‍👧 Money for family", bucket: "must-pays", itemName: "Family Support" },
  { id: "apps-ott", label: "📱 Apps & OTT", bucket: "fun-money", itemName: "Subscriptions" },
  { id: "loan-emi", label: "💳 Loan/EMI", bucket: "must-pays", itemName: "Loan / EMI" },
  { id: "groceries", label: "🛒 Groceries", bucket: "must-pays", itemName: "Groceries" },
  { id: "self-care", label: "✂️ Haircuts & self-care", bucket: "fun-money", itemName: "Self-care" },
];

export interface TreatChip {
  id: string;
  label: string;
  itemName: string;
}

/** Q4 (treat) chip catalogue — always seeds Fun money items. */
export const TREAT_CHIPS: TreatChip[] = [
  { id: "coffee", label: "☕ Coffee runs", itemName: "Coffee" },
  { id: "movies", label: "🎬 Movies & shows", itemName: "Movies & Shows" },
  { id: "food-delivery", label: "🍕 Weekend food orders", itemName: "Food Delivery" },
  { id: "gaming", label: "🎮 Gaming", itemName: "Gaming" },
  { id: "shopping", label: "🛍 A little shopping", itemName: "Shopping" },
  { id: "matches", label: "🏏 Match days out", itemName: "Sports & Matches" },
];

export interface DreamMeta {
  planName: string;
  goalLabel: string;
  goalIcon: string;
  /** Percentage points shaved off Must-pays/Fun money and added to the goal slice. */
  goalPctBoost: number;
}

/** Q3 (dream) → plan name + goal-category emphasis. */
export const DREAM_META: Record<DreamId, DreamMeta> = {
  "emergency-fund": { planName: "The Safety Net Plan 🛟", goalLabel: "Safety net", goalIcon: "🛟", goalPctBoost: 5 },
  trip: { planName: "The Trip Fund Plan ✈️", goalLabel: "Trip fund", goalIcon: "✈️", goalPctBoost: 5 },
  "big-purchase": { planName: "The Big Buy Plan 🎯", goalLabel: "Big purchase fund", goalIcon: "🎯", goalPctBoost: 5 },
  "no-stress": { planName: "Your Calm Month Plan 🐾", goalLabel: "Savings", goalIcon: "💰", goalPctBoost: 0 },
};

export interface ResolvedQuizAnswers {
  habit: HabitId;
  life: string[];
  dream: DreamId;
  treat: string[];
  amount: number;
}

export interface QuizPlan {
  planName: string;
  total: number;
  categories: SetupCategory[]; // Must-pays / Fun money / <goal label>
}

/**
 * Shave `boostPct` off the Fun money slice (never below FUN_MONEY_FLOOR_PCT)
 * and, if that isn't enough, off Must-pays — then add exactly what was taken
 * to Savings. The three percentages always keep the same sum they started
 * with, so the split never silently drifts off 100%.
 */
export function applyGoalBoost(
  ratio: SplitRatio,
  boostPct: number,
  fundMoneyFloorPct: number = FUN_MONEY_FLOOR_PCT
): SplitRatio {
  if (boostPct <= 0) return ratio;
  const maxFromWants = Math.max(0, ratio.wantsPct - fundMoneyFloorPct);
  const fromWants = Math.min(boostPct, maxFromWants);
  const remaining = boostPct - fromWants;
  const fromNeeds = Math.min(remaining, Math.max(0, ratio.needsPct));
  const actualBoost = fromWants + fromNeeds;
  return {
    needsPct: ratio.needsPct - fromNeeds,
    wantsPct: ratio.wantsPct - fromWants,
    savingsPct: ratio.savingsPct + actualBoost,
  };
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function dedupe(names: string[]): string[] {
  return Array.from(new Set(names.filter((n) => n.trim().length > 0)));
}

/**
 * Build the named, fully-allocated budget plan the reveal screen shows.
 * `mkId` is injected for testability (same convention as setupMath.ts).
 */
export function buildPlanFromAnswers(
  answers: ResolvedQuizAnswers,
  mkId: () => string
): QuizPlan {
  const ratio = applyGoalBoost(SPLIT_RATIOS[answers.habit], DREAM_META[answers.dream].goalPctBoost);
  const dreamMeta = DREAM_META[answers.dream];

  const mustPayItems = dedupe(
    LIFE_CHIPS.filter((c) => answers.life.includes(c.id) && c.bucket === "must-pays").map(
      (c) => c.itemName
    )
  );
  const funMoneyItems = dedupe([
    ...LIFE_CHIPS.filter((c) => answers.life.includes(c.id) && c.bucket === "fun-money").map(
      (c) => c.itemName
    ),
    ...TREAT_CHIPS.filter((c) => answers.treat.includes(c.id)).map((c) => c.itemName),
  ]);

  const finalMustPayItems = mustPayItems.length > 0 ? mustPayItems : suggestItemNames("Must-pays", "needs");
  const finalFunMoneyItems = funMoneyItems.length > 0 ? funMoneyItems : suggestItemNames("Fun money", "wants");

  const pseudoTemplate: BudgetTemplate = {
    id: "quiz",
    name: dreamMeta.planName,
    description: "Built from your quiz answers",
    preview: [],
    categories: [
      {
        name: "Must-pays",
        icon: "🏠",
        allocationPct: ratio.needsPct,
        items: finalMustPayItems.map((name) => ({
          name,
          templateItemId: `quiz:must-pays:${slug(name)}`,
        })),
      },
      {
        name: "Fun money",
        icon: "🍜",
        allocationPct: ratio.wantsPct,
        items: finalFunMoneyItems.map((name) => ({
          name,
          templateItemId: `quiz:fun-money:${slug(name)}`,
        })),
      },
      {
        name: dreamMeta.goalLabel,
        icon: dreamMeta.goalIcon,
        allocationPct: ratio.savingsPct,
        items: [{ name: dreamMeta.goalLabel, templateItemId: `quiz:goal:${answers.dream}` }],
      },
    ],
  };

  const categories = templateToSetupCategories(pseudoTemplate, answers.amount, mkId);

  return {
    planName: dreamMeta.planName,
    total: answers.amount,
    categories,
  };
}

/** Server-action payload shape for setupBudgetFromTemplate — mirrors the
 *  shape the old FirstBudgetCard.templateToServerCategories built. Items stay
 *  at their seeded (₹0) planned amount: category totals are real money, items
 *  are quick-add suggestions the user fills in later (same "seed the list,
 *  don't author" pattern as BudgetQuickSetup's addCategory). */
export function quizPlanToServerCategories(plan: QuizPlan) {
  return plan.categories.map((c) => ({
    tempId: c.id,
    name: c.name,
    icon: c.icon,
    type: "misc" as const,
    allocated_amount: c.allocation,
    items: c.items.map((i) => ({
      tempId: i.id,
      name: i.name,
      planned: i.allocation,
      templateItemId: i.templateItemId ?? undefined,
    })),
  }));
}
