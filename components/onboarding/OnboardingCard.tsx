"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";

export interface OnboardingCardProps {
  /** Mono eyebrow label, e.g. "01 — Budget". */
  eyebrow: string;
  title: ReactNode;
  body: ReactNode;
  /** Optional Material Symbol shown before the eyebrow. */
  icon?: string;
  /** Mini feature preview rendered above the copy. */
  visual?: ReactNode;
}

/**
 * Editorial card shell for a teaching slide: a mini visual above a display
 * heading and body. Content staggers in; honors reduced-motion.
 */
export function OnboardingCard({
  eyebrow,
  title,
  body,
  icon,
  visual,
}: OnboardingCardProps) {
  const reduce = useReducedMotion();
  const rise = reduce
    ? {}
    : ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 } } as const);

  return (
    <div className="flex h-full w-full flex-col justify-center gap-9 px-7 py-8">
      {visual ? (
        <motion.div
          {...(reduce
            ? {}
            : {
                initial: { opacity: 0, scale: 0.96 },
                animate: { opacity: 1, scale: 1 },
              })}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
          className="flex min-h-[180px] items-center justify-center"
        >
          {visual}
        </motion.div>
      ) : null}

      <div className="flex flex-col gap-4">
        <motion.div
          {...rise}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-accent-strong"
        >
          {icon ? (
            <MaterialSymbol icon={icon} className="text-sm text-accent-strong" />
          ) : null}
          {eyebrow}
        </motion.div>

        <motion.h1
          {...rise}
          transition={{ duration: 0.5, delay: 0.16 }}
          className="font-display text-[clamp(2rem,8.5vw,3rem)] font-bold leading-[0.98] tracking-tight text-white"
        >
          {title}
        </motion.h1>

        <motion.p
          {...rise}
          transition={{ duration: 0.5, delay: 0.22 }}
          className="max-w-md text-[15px] leading-relaxed text-white/55"
        >
          {body}
        </motion.p>
      </div>
    </div>
  );
}
