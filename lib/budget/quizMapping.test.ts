import { describe, it, expect } from "vitest";
import {
  SPLIT_RATIOS,
  DREAM_META,
  HABIT_DEFAULT,
  DREAM_DEFAULT,
  applyGoalBoost,
  buildPlanFromAnswers,
  quizPlanToServerCategories,
  type ResolvedQuizAnswers,
} from "./quizMapping";

function mkIdFactory(): () => string {
  let n = 0;
  return () => `uuid-${++n}`;
}

describe("SPLIT_RATIOS", () => {
  it("every ratio sums to 100", () => {
    for (const ratio of Object.values(SPLIT_RATIOS)) {
      expect(ratio.needsPct + ratio.wantsPct + ratio.savingsPct).toBe(100);
    }
  });
});

describe("applyGoalBoost", () => {
  const ratio = { needsPct: 50, wantsPct: 30, savingsPct: 20 };

  it("is a no-op for zero/negative boost", () => {
    expect(applyGoalBoost(ratio, 0)).toEqual(ratio);
    expect(applyGoalBoost(ratio, -5)).toEqual(ratio);
  });

  it("shaves the boost off wants first, adds it to savings, keeps the sum", () => {
    const out = applyGoalBoost(ratio, 5);
    expect(out.wantsPct).toBe(25);
    expect(out.needsPct).toBe(50);
    expect(out.savingsPct).toBe(25);
    expect(out.needsPct + out.wantsPct + out.savingsPct).toBe(100);
  });

  it("never drops wants below the fun-money floor, even under a large boost", () => {
    const out = applyGoalBoost(ratio, 50, 10);
    expect(out.wantsPct).toBeGreaterThanOrEqual(10);
    expect(out.needsPct).toBeGreaterThanOrEqual(0);
    expect(out.needsPct + out.wantsPct + out.savingsPct).toBe(100);
  });
});

describe("buildPlanFromAnswers", () => {
  const defaultAnswers: ResolvedQuizAnswers = {
    habit: HABIT_DEFAULT,
    life: [],
    dream: DREAM_DEFAULT,
    treat: [],
    amount: 45000,
  };

  it("produces a plan whose category allocations sum exactly to the total, even fully-skipped", () => {
    const plan = buildPlanFromAnswers(defaultAnswers, mkIdFactory());
    expect(plan.categories).toHaveLength(3);
    const sum = plan.categories.reduce((s, c) => s + c.allocation, 0);
    expect(sum).toBe(45000);
    expect(plan.planName).toBe(DREAM_META[DREAM_DEFAULT].planName);
  });

  it("falls back to suggested item names when no life/treat chips were picked", () => {
    const plan = buildPlanFromAnswers(defaultAnswers, mkIdFactory());
    expect(plan.categories[0].items.length).toBeGreaterThan(0);
    expect(plan.categories[1].items.length).toBeGreaterThan(0);
  });

  it("seeds items from picked chips, deduped across life + treat", () => {
    const answers: ResolvedQuizAnswers = {
      habit: "save-first",
      life: ["rent", "food-delivery", "groceries"],
      dream: "trip",
      treat: ["food-delivery", "coffee"],
      amount: 60000,
    };
    const plan = buildPlanFromAnswers(answers, mkIdFactory());
    const mustPays = plan.categories.find((c) => c.name === "Must-pays")!;
    const funMoney = plan.categories.find((c) => c.name === "Fun money")!;
    expect(mustPays.items.map((i) => i.name)).toEqual(
      expect.arrayContaining(["Rent / EMI", "Groceries"])
    );
    // "Food Delivery" appears in both life and treat chips — must be deduped.
    const foodDeliveryCount = funMoney.items.filter((i) => i.name === "Food Delivery").length;
    expect(foodDeliveryCount).toBe(1);
    expect(plan.planName).toBe("The Trip Fund Plan ✈️");
    const sum = plan.categories.reduce((s, c) => s + c.allocation, 0);
    expect(sum).toBe(60000);
  });

  it("assigns unique ids across categories and items", () => {
    const plan = buildPlanFromAnswers(defaultAnswers, mkIdFactory());
    const ids = new Set([
      ...plan.categories.map((c) => c.id),
      ...plan.categories.flatMap((c) => c.items.map((i) => i.id)),
    ]);
    expect(ids.size).toBe(
      plan.categories.length + plan.categories.flatMap((c) => c.items).length
    );
  });
});

describe("quizPlanToServerCategories", () => {
  it("shapes categories/items for setupBudgetFromTemplate", () => {
    const plan = buildPlanFromAnswers(
      { habit: HABIT_DEFAULT, life: [], dream: DREAM_DEFAULT, treat: [], amount: 45000 },
      mkIdFactory()
    );
    const server = quizPlanToServerCategories(plan);
    expect(server).toHaveLength(3);
    expect(server[0]).toEqual(
      expect.objectContaining({
        tempId: expect.any(String),
        name: "Must-pays",
        icon: "🏠",
        type: "misc",
        allocated_amount: expect.any(Number),
      })
    );
    expect(server[0].items[0]).toEqual(
      expect.objectContaining({
        tempId: expect.any(String),
        name: expect.any(String),
        planned: expect.any(Number),
      })
    );
  });
});
