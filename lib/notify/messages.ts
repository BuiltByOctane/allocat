import { formatCurrency } from "@/lib/number-format";

export type OverspendTier = 1 | 2 | 3;

export interface OverspendCtx {
  itemName: string;
  tier: OverspendTier;
  count: number; // 1, 2, 3+
  over: number; // actual - planned, > 0
  currency: string;
  firstOverspend: boolean; // count === 1
  /** Stable seed so re-renders pick the SAME variant. Defaults to `${itemName}:${count}`. */
  seed?: string;
}

export interface NotifMessage {
  title: string;
  body: string;
}

export function tierForCount(count: number): OverspendTier {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  return 3;
}

/** FNV-1a hash → stable, bounded index. */
export function poolIndex(seed: string, len: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h) % Math.max(1, len);
}

type Template = { title: string; body: (c: OverspendCtx, over: string) => string };

// NO em-dash anywhere below. Mirror of android SmsMessages.java — keep in lockstep.
const TIER1: Template[] = [
  {
    title: "🙀 Over budget",
    body: (c, over) =>
      `${c.itemName} just went ${over} over. That overflow comes from your other allocations or savings.`,
  },
  {
    title: "😼 Budget blown",
    body: (c, over) =>
      `${c.itemName} is ${over} past plan. AlloCat's borrowing it from your other pots for now.`,
  },
  {
    title: "🐾 Spilled the bowl",
    body: (c, over) =>
      `${c.itemName} tipped ${over} over. The extra is coming out of your savings or other budgets.`,
  },
];

const TIER2: Template[] = [
  {
    title: "🙀 Over again",
    body: (c, over) =>
      `${c.itemName} is over a second time, now ${over} past plan. Worth a glance before the next swipe.`,
  },
  {
    title: "😾 Twice over",
    body: (c, over) =>
      `That's two overspends on ${c.itemName}. You're ${over} deep into other allocations.`,
  },
  {
    title: "🐾 Climbing",
    body: (c, over) =>
      `${c.itemName} crossed the line again, ${over} over. The cat's keeping count.`,
  },
];

const TIER3: Template[] = [
  {
    title: "🙀 Over and over",
    body: (c, over) =>
      `${c.itemName} keeps going over, now ${over} past plan. Might be time to re-plan this one.`,
  },
  {
    title: "😼 A pattern",
    body: (c, over) =>
      `${c.itemName} is ${over} over yet again. Want to move some funds or raise the budget?`,
  },
  {
    title: "🐾 The cat's concerned",
    body: (c, over) =>
      `${c.itemName} has run over more than twice, ${over} this time. Your savings are quietly covering it.`,
  },
];

const POOLS: Record<OverspendTier, Template[]> = { 1: TIER1, 2: TIER2, 3: TIER3 };

export function pickOverspendMessage(ctx: OverspendCtx): NotifMessage {
  const pool = POOLS[ctx.tier] ?? TIER1;
  const seed = ctx.seed ?? `${ctx.itemName}:${ctx.count}`;
  const t = pool[poolIndex(seed, pool.length)];
  const over = formatCurrency(Math.abs(ctx.over), { code: ctx.currency });
  return { title: t.title, body: t.body(ctx, over) };
}

// New-month "no budget set yet" nudge. Same cat voice, NO em-dash.
const BUDGET_REMINDER: NotifMessage[] = [
  {
    title: "🐱 New month, empty bowl",
    body: "It's a fresh month and no budget is set yet. Give AlloCat a plan to guard.",
  },
  {
    title: "😺 Fresh month",
    body: "Your budget for this month is still blank. Set it up so the cat can track your spends.",
  },
  {
    title: "🐾 Plan the month",
    body: "New month, no budget yet. Take a minute to set one up and stay in control.",
  },
];

/** Pick a stable new-month budget reminder. `seed` should be `${year}-${month}`. */
export function pickBudgetReminderMessage(seed: string): NotifMessage {
  return BUDGET_REMINDER[poolIndex(seed, BUDGET_REMINDER.length)];
}
