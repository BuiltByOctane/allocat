"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

export interface QuizQuestionShellProps {
  /** e.g. "Question 1 of 5". */
  eyebrow: string;
  title: ReactNode;
  /** At most one reassurance line per screen - enforced by only exposing a
   *  single optional prop rather than free-form children. */
  reassurance?: string;
  onSkip: () => void;
  /** The option/chip grid. */
  children: ReactNode;
  /** Multi-select screens' own Continue button, shown above Skip. */
  footer?: ReactNode;
}

/** Shared dark-editorial chrome for every quiz question screen. */
export function QuizQuestionShell({
  eyebrow,
  title,
  reassurance,
  onSkip,
  children,
  footer,
}: QuizQuestionShellProps) {
  const reduce = useReducedMotion();
  const rise = reduce
    ? {}
    : ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 } } as const);

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto px-7 py-8 no-scrollbar">
      <motion.div
        {...rise}
        transition={{ duration: 0.45, delay: 0.05 }}
        className="text-[11px] font-bold uppercase tracking-wide text-accent-strong"
      >
        {eyebrow}
      </motion.div>

      <motion.h1
        {...rise}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="font-display text-[clamp(1.75rem,7.5vw,2.4rem)] font-bold leading-[1.08] tracking-tight text-white"
      >
        {title}
      </motion.h1>

      <motion.div
        {...rise}
        transition={{ duration: 0.5, delay: 0.16 }}
        className="flex flex-col gap-2.5"
      >
        {children}
      </motion.div>

      {reassurance ? (
        <p className="text-center text-[12px] text-white/45">{reassurance}</p>
      ) : null}

      <div className="mt-auto flex flex-col gap-3 pt-2">
        {footer}
        <button
          type="button"
          onClick={onSkip}
          className="self-start py-2 text-xs font-bold uppercase tracking-widest text-white/45 transition hover:text-white/80"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
