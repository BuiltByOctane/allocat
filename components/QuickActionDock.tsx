"use client";

import { AnimatePresence, motion, type Transition } from "motion/react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useQuickAction } from "@/lib/providers/QuickActionProvider";

// The paw SVG is a flat black shape — render it as a CSS mask so it picks up
// currentColor and stays visible against the glass dock in both light and dark.
const PAW_MASK: React.CSSProperties = {
  WebkitMaskImage: "url(/profile/paw.svg)",
  maskImage: "url(/profile/paw.svg)",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskPosition: "center",
  WebkitMaskSize: "contain",
  maskSize: "contain",
};

const spring: Transition = { type: "spring", stiffness: 520, damping: 42, mass: 0.7 };

export default function QuickActionDock() {
  const { action } = useQuickAction();
  const haptic = useHaptic();

  const Icon = action && action.icon !== "paw" ? action.icon : null;

  return (
    <AnimatePresence mode="popLayout">
      {action && (
        <motion.button
          key={action.id}
          layout
          id="quick-action-dock"
          type="button"
          aria-label={action.label}
          onClick={() => {
            haptic.light();
            action.onTrigger();
          }}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.4 }}
          whileTap={{ scale: 0.92 }}
          transition={spring}
          className="md:hidden flex items-center justify-center size-14 rounded-full glass-dock backdrop-filter backdrop-blur-sm bg-opacity-0 text-foreground"
        >
          {action.icon === "paw" ? (
            <span aria-hidden className="size-7 bg-current" style={PAW_MASK} />
          ) : Icon ? (
            <Icon size={20} strokeWidth={1.9} />
          ) : null}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
