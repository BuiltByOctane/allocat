"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AnimatedNumber } from "./AnimatedNumber";
import { OnboardingCard } from "./OnboardingCard";

export interface TeachingSlide {
  key: string;
  eyebrow: string;
  icon: string;
  title: ReactNode;
  body: ReactNode;
  visual: ReactNode;
}

// ─── Mini feature previews ──────────────────────────────────────────────────

function WelcomeVisual() {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex items-center justify-center">
      {!reduce && (
        <motion.span
          aria-hidden
          className="absolute rounded-full border border-white/10"
          initial={{ width: 96, height: 96, opacity: 0.5 }}
          animate={{ width: 200, height: 200, opacity: 0 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span
        aria-hidden
        className="absolute size-[168px] rounded-full border border-white/[0.07]"
      />
      <div className="flex size-24 items-center justify-center rounded-[28px] bg-accent">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/paw-white.png" alt="AlloCat" className="size-14 opacity-90 [filter:brightness(0)_saturate(100%)]" />
      </div>
    </div>
  );
}

function MiniFrame({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-[300px] rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      {children}
    </div>
  );
}

function BudgetVisual() {
  const reduce = useReducedMotion();
  const SEGMENTS = 24;
  const FILLED = 16; // ~66% spent
  return (
    <MiniFrame>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-white/40">
          Budget left
        </span>
        <span className="text-[10px] font-medium text-white/30">June</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-base text-white/50">₹</span>
        <AnimatedNumber
          value={12400}
          className="font-display text-4xl font-bold tracking-tight tabular-nums text-white"
        />
      </div>
      <div className="mt-4 flex gap-[3px]">
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <motion.span
            key={i}
            className={`h-7 flex-1 rounded-[2px] ${
              i < FILLED ? "bg-accent" : "bg-white/15"
            }`}
            initial={reduce ? false : { opacity: i < FILLED ? 0.15 : 0.15 }}
            animate={{ opacity: i < FILLED ? 1 : 0.15 }}
            transition={{ delay: reduce ? 0 : 0.35 + i * 0.022, duration: 0.18 }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-medium text-white/35">
        <span>₹24,600 spent</span>
        <span>₹37,000 budget</span>
      </div>
    </MiniFrame>
  );
}

function GrowVisual() {
  const reduce = useReducedMotion();
  return (
    <MiniFrame>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-white/40">
          Net worth
        </span>
        <span className="text-[10px] font-bold text-accent-strong">+4.2%</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-base text-white/50">₹</span>
        <AnimatedNumber
          value={320000}
          className="font-display text-4xl font-bold tracking-tight tabular-nums text-white"
        />
      </div>
      <svg viewBox="0 0 240 72" className="mt-3 h-16 w-full" fill="none">
        <motion.path
          d="M4 60 L40 54 L76 56 L112 40 L148 45 L184 22 L236 8"
          stroke="var(--accent-strong)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        />
        <motion.circle
          cx={236}
          cy={8}
          r={3.5}
          fill="var(--accent-strong)"
          initial={reduce ? false : { opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: reduce ? 0 : 1.45, duration: 0.3 }}
        />
      </svg>
    </MiniFrame>
  );
}

function SmsVisual() {
  const reduce = useReducedMotion();
  return (
    <div className="w-full max-w-[300px] space-y-2">
      <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.04] px-4 py-3">
        <span className="text-[10px] font-bold uppercase tracking-wide text-white/35">
          HDFC Bank · now
        </span>
        <p className="mt-1 text-[12px] leading-relaxed text-white/70">
          Rs.450.00 debited at <span className="text-white">SWIGGY</span> on
          06-Jun. UPI Ref 4521…
        </p>
      </div>
      <div className="flex justify-center">
        <span className="material-symbols-outlined text-base text-white/30">
          arrow_downward
        </span>
      </div>
      <motion.div
        className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-accent px-4 py-3 text-[var(--accent-ink)]"
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 0.6, duration: 0.4 }}
      >
        <span className="text-base">🍽️</span>
        <span className="text-[12px] font-semibold">Dining Out · ₹450</span>
        <span className="ml-auto text-[9px] font-bold uppercase tracking-wide text-[var(--accent-ink)]/60">
          auto-logged
        </span>
      </motion.div>
    </div>
  );
}

function AiVisual() {
  const reduce = useReducedMotion();
  return (
    <div className="w-full max-w-[300px] space-y-2">
      <div className="ml-auto max-w-[82%] rounded-2xl rounded-tr-sm bg-accent px-4 py-2 text-[12px] text-[var(--accent-ink)]">
        Can I afford dinner out this week?
      </div>
      <motion.div
        className="mr-auto flex max-w-[88%] items-end gap-1 rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.04] px-4 py-2 text-[12px] text-white/75"
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 0.55, duration: 0.4 }}
      >
        <span>
          You&apos;ve got ₹2,800 left in Wants - enjoy it.
        </span>
        <span className="text-sm">🐾</span>
      </motion.div>
    </div>
  );
}

// ─── Slide definitions ──────────────────────────────────────────────────────

export const TEACHING_SLIDES: TeachingSlide[] = [
  {
    key: "welcome",
    eyebrow: "AlloCat",
    icon: "pets",
    title: (
      <>
        Money, the
        <br />
        calm way.
      </>
    ),
    body: "Personal finance that feels as calm and intentional as a cat choosing its sunny spot. In the next minute you'll see what AlloCat does - then we'll build your first budget together. No forms, promise.",
    visual: <WelcomeVisual />,
  },
  {
    key: "budget",
    eyebrow: "01 - Budget",
    icon: "account_balance_wallet",
    title: (
      <>
        One number to check,
        <br />
        not ten.
      </>
    ),
    body: "“Can I spend this?” gets a yes or no at a glance. AlloCat warns you before you overspend - never after.",
    visual: <BudgetVisual />,
  },
  {
    key: "grow",
    eyebrow: "02 - Net worth · debt · goals",
    icon: "trending_up",
    title: (
      <>
        Watch your
        <br />
        worth grow.
      </>
    ),
    body: "Assets minus debts, in one line. Pay down loans, hit savings goals, and see the trend climb month over month.",
    visual: <GrowVisual />,
  },
  {
    key: "sms",
    eyebrow: "03 - Auto-tracking · Android",
    icon: "sms",
    title: (
      <>
        Spends log
        <br />
        themselves.
      </>
    ),
    body: "Bank SMS becomes a logged spend, on your phone, automatically. The raw message never leaves your device.",
    visual: <SmsVisual />,
  },
  {
    key: "ai",
    eyebrow: "04 - Ask AlloCat",
    icon: "auto_awesome",
    title: (
      <>
        A cat that knows
        <br />
        your money.
      </>
    ),
    body: "Ask anything about your budget, debts or goals. AlloCat answers from your real numbers - helpful and calm, never preachy.",
    visual: <AiVisual />,
  },
];

// ─── Quiz invite slide (final tour slide, custom footer/CTAs) ──────────────

const QUIZ_INVITE_TAGS = ["No typing", "~60 sec", "Editable later"];

/** Content for the tour's final slide: sells the upcoming quiz, then hands
 *  off to it (or lets the user skip straight to the dashboard). Not a plain
 *  TeachingSlide since it needs two custom CTAs instead of the deck's Next
 *  button - built by the caller (app/onboarding/page.tsx) with its own
 *  handlers wired to the tour/quiz mode switch. */
export function QuizInviteCard({
  onBuildBudget,
  onSkip,
}: {
  onBuildBudget: () => void;
  onSkip: () => void;
}) {
  return (
    <OnboardingCard
      eyebrow="05 - Your budget"
      icon="auto_awesome"
      title={
        <>
          Tell us about
          <br />
          your month.
        </>
      }
      body="A few quick taps about how you live and spend - we'll do the math and hand you a working budget."
      footer={
        <>
          <div className="flex flex-wrap gap-2">
            {QUIZ_INVITE_TAGS.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/15 px-3 py-1.5 text-[11.5px] font-semibold text-white/55"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onBuildBudget}
              className="w-full rounded-pill bg-accent py-4 text-sm font-bold text-[var(--accent-ink)] transition active:scale-[0.98]"
            >
              Build my budget
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="w-full py-2 text-xs font-bold uppercase tracking-widest text-white/45 transition hover:text-white/80"
            >
              I&apos;ll explore first
            </button>
          </div>
        </>
      }
    />
  );
}
