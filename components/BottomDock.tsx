"use client";

import { LayoutGroup, motion } from "motion/react";
import BottomNav from "@/components/BottomNav";
import QuickActionDock from "@/components/QuickActionDock";

/**
 * Mobile bottom dock — the centered nav + an optional route-aware quick-action
 * button rendered as one group. When the dock button is present it pushes the
 * nav left so the pair reads as a single centered cluster.
 *
 * The FAB registers in an effect (after hydration), so it appears a beat after
 * the nav. LayoutGroup coordinates the two so the nav *slides* to its shifted
 * position while the FAB scales in — instead of a sudden recenter jump.
 *
 * `layoutScroll layoutRoot` is essential: the dock is `position: fixed` but the
 * page scrolls at the document level (mobile). Without them, Motion resolves the
 * nav/pill layout boxes against the document scroll offset — so after a nav tap
 * resets the scroll to top, the whole dock animates in "from below" by the
 * scroll delta. `layoutScroll` makes Motion measure children relative to this
 * (scroll-independent) fixed element, and `layoutRoot` marks it as the root.
 */
export default function BottomDock() {
  return (
    <motion.div
      layoutScroll
      layoutRoot
      data-bottom-dock
      className="md:hidden fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-2"
      style={{ bottom: "calc(14px + env(safe-area-inset-bottom))" }}
    >
      <LayoutGroup>
        <BottomNav />
        <QuickActionDock />
      </LayoutGroup>
    </motion.div>
  );
}
