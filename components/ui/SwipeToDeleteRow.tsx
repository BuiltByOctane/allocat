"use client";

import { useState, type ReactNode } from "react";
import { motion, animate, useMotionValue, useReducedMotion } from "motion/react";
import { useHaptic } from "@/lib/hooks/useHaptic";

const ACTION_WIDTH = 76;
const SNAP = { type: "spring", stiffness: 420, damping: 40 } as const;

/**
 * Swipe-left-to-reveal-delete for list rows. Reduced-motion users (and
 * anyone without a pointer/touch drag) still get the row unswiped — delete
 * only ever needs an explicit confirm from the caller, so exposing no
 * fallback affordance here is fine as long as the row content itself has
 * another way to reach delete (e.g. the full edit sheet).
 */
export function SwipeToDeleteRow({
  children,
  onDelete,
  disabled = false,
}: {
  children: ReactNode;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const haptic = useHaptic();
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const [open, setOpen] = useState(false);

  function settle(toOpen: boolean) {
    if (toOpen !== open) haptic.light();
    setOpen(toOpen);
    animate(x, toOpen ? -ACTION_WIDTH : 0, SNAP);
  }

  if (reduce || disabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden rounded-card">
      <div
        className="absolute inset-y-0 right-0"
        style={{ width: ACTION_WIDTH }}
      >
        <button
          type="button"
          onClick={() => {
            haptic.heavy();
            onDelete();
          }}
          aria-label="Delete item"
          className="flex h-full w-full items-center justify-center bg-[var(--neg-dim)] text-neg"
        >
          <span className="material-symbols-outlined text-[20px]">delete</span>
        </button>
      </div>
      <motion.div
        drag="x"
        style={{ x }}
        dragConstraints={{ left: -ACTION_WIDTH, right: 0 }}
        dragElastic={0.06}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          const projected = x.get() + info.velocity.x * 0.2;
          settle(projected < -ACTION_WIDTH / 2);
        }}
        onClickCapture={(e) => {
          if (open) {
            e.preventDefault();
            e.stopPropagation();
            settle(false);
          }
        }}
        className="relative bg-card"
      >
        {children}
      </motion.div>
    </div>
  );
}
