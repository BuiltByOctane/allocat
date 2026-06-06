"use client";

import { useEffect } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";

interface AnimatedNumberProps {
  value: number;
  /** Seconds for the count-up. */
  duration?: number;
  /** Format the interpolated value to a string. Defaults to en-IN grouping. */
  format?: (v: number) => string;
  className?: string;
}

/**
 * Counts up from 0 to `value` on mount. Used for the mini feature previews in
 * onboarding. Respects prefers-reduced-motion (jumps straight to the value).
 */
export function AnimatedNumber({
  value,
  duration = 1.1,
  format,
  className,
}: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) =>
    format ? format(v) : Math.round(v).toLocaleString("en-IN")
  );

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [value, duration, reduce, mv]);

  return <motion.span className={className}>{text}</motion.span>;
}
