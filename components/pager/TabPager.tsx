"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { navItems } from "@/lib/nav/navItems";
import { useHaptic } from "@/lib/hooks/useHaptic";
import DashboardScreen from "@/app/(app)/dashboard/page";
import BudgetScreen from "@/app/(app)/budget/page";
import NetWorthScreen from "@/app/(app)/net-worth/page";
import DebtScreen from "@/app/(app)/debt/page";
import ProfileScreen from "@/components/profile/ProfilePage";

// MUST stay in the same order as navItems.
const SCREENS = [DashboardScreen, BudgetScreen, NetWorthScreen, DebtScreen, ProfileScreen];

const SNAP = { type: "spring", stiffness: 380, damping: 40, mass: 0.85 } as const;
const AXIS_LOCK_PX = 8; // movement before we decide horizontal vs vertical
const COMMIT_RATIO = 0.2; // drag this fraction of the width to change tabs
const VELOCITY_PROJECT = 0.15; // seconds of momentum added to the release point
const EDGE_RESIST = 0.35; // rubber-band factor past the first/last tab

/**
 * Single-sheet horizontal pager over the 5 primary tabs. The page body tracks
 * the finger as you drag and snaps to the neighbouring tab on release — one
 * continuous sheet, not a route-to-route slide.
 *
 * Anti-jank: cold start mounts ONLY the active tab (zero added launch cost).
 * Neighbours mount lazily — on idle after first paint, and eagerly the instant a
 * finger touches down — then stay mounted/warm so re-swiping is instant. Tab data
 * is already warm in the React Query cache (offline-first prefetch), so a freshly
 * mounted neighbour renders from cache with no skeleton. Each pane is its own
 * scroll container, so tabs remember their scroll position and PullToRefresh
 * (which finds the nearest overflow-auto ancestor) keeps working per-tab.
 *
 * Mounted by PagerGate only on the native app + a tab route; web/desktop and
 * reduced-motion never see it.
 */
export function TabPager() {
  const pathname = usePathname();
  const router = useRouter();
  const haptic = useHaptic();
  const reduce = useReducedMotion();

  const pathIndex = Math.max(
    0,
    navItems.findIndex((item) => item.href === pathname),
  );

  const [index, setIndex] = useState(pathIndex);
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([pathIndex]));
  const [width, setWidth] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);

  // Gesture bookkeeping.
  const pointerId = useRef<number | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const baseX = useRef(0);
  const axis = useRef<null | "x" | "y">(null);
  const lockOffset = useRef(0); // dx consumed by the axis-lock dead-zone
  const dragging = useRef(false);
  const lastX = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0);

  // Mount target ± its neighbours (current±1). Once mounted, panes stay mounted.
  const ensureMounted = useCallback((target: number) => {
    setMounted((prev) => {
      let next: Set<number> | null = null;
      for (const n of [target - 1, target, target + 1]) {
        if (n >= 0 && n < SCREENS.length && !prev.has(n)) {
          next ??= new Set(prev);
          next.add(n);
        }
      }
      return next ?? prev;
    });
  }, []);

  // Track the container width (px-based track keeps drag math exact).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Settle the track whenever the active index or width changes (and we're not
  // mid-drag, so a measure during a swipe doesn't fight the finger).
  useEffect(() => {
    if (dragging.current || width === 0) return;
    const target = -index * width;
    if (reduce) {
      x.set(target);
    } else {
      const controls = animate(x, target, SNAP);
      return () => controls.stop();
    }
  }, [index, width, reduce, x]);

  // External navigation (bottom-nav tap, deep link) → follow the URL.
  useEffect(() => {
    setIndex(pathIndex);
    ensureMounted(pathIndex);
  }, [pathIndex, ensureMounted]);

  // Warm the neighbours after first paint (deferred so launch stays cheap).
  useEffect(() => {
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => ensureMounted(pathIndex));
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => ensureMounted(pathIndex), 350);
    return () => window.clearTimeout(id);
  }, [pathIndex, ensureMounted]);

  const settle = (target: number) => {
    const clamped = Math.max(0, Math.min(SCREENS.length - 1, target));
    if (clamped !== index) {
      haptic.selection();
      setIndex(clamped);
      ensureMounted(clamped);
      router.push(navItems[clamped].href); // sync URL + bottom-nav highlight
    } else if (width > 0) {
      animate(x, -index * width, SNAP); // snap back
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (reduce || width === 0) return;
    pointerId.current = e.pointerId;
    startX.current = e.clientX;
    startY.current = e.clientY;
    lastX.current = e.clientX;
    lastT.current = e.timeStamp;
    velocity.current = 0;
    baseX.current = -index * width;
    axis.current = null;
    dragging.current = false;
    ensureMounted(index); // mount-on-intent: neighbour ready before threshold
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointerId.current == null || reduce) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    if (axis.current == null) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (axis.current === "x") {
        lockOffset.current = dx; // start tracking from here → no start jump
        dragging.current = true;
        try {
          containerRef.current?.setPointerCapture(pointerId.current);
        } catch {
          // best-effort
        }
      }
    }
    if (axis.current !== "x") return; // vertical → let the pane scroll

    // Velocity estimate for flick detection.
    const dt = e.timeStamp - lastT.current;
    if (dt > 0) velocity.current = ((e.clientX - lastX.current) / dt) * 1000;
    lastX.current = e.clientX;
    lastT.current = e.timeStamp;

    let next = baseX.current + (dx - lockOffset.current);
    const max = 0;
    const min = -(SCREENS.length - 1) * width;
    if (next > max) next = max + (next - max) * EDGE_RESIST;
    else if (next < min) next = min + (next - min) * EDGE_RESIST;
    x.set(next);
  };

  const endDrag = () => {
    const wasDragging = axis.current === "x" && dragging.current;
    if (wasDragging) {
      const moved = x.get() - baseX.current;
      // Project the release point forward by its momentum (iOS-style): a slow
      // drag commits on distance alone, a fast flick commits on a short throw.
      const projected = moved + velocity.current * VELOCITY_PROJECT;
      const threshold = width * COMMIT_RATIO;
      let target = index;
      if (projected <= -threshold) target = index + 1;
      else if (projected >= threshold) target = index - 1;
      settle(target);
    }
    pointerId.current = null;
    axis.current = null;
    dragging.current = false;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden"
      style={{ height: "calc(100dvh - env(safe-area-inset-top))", touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <motion.div className="flex h-full" style={{ x }}>
        {SCREENS.map((Screen, i) => (
          <div
            key={navItems[i].href}
            aria-hidden={i !== index}
            className="h-full shrink-0 grow-0 overflow-y-auto overscroll-contain no-scrollbar"
            style={{
              width: width || "100%",
              touchAction: "pan-y",
              contentVisibility: i === index ? "visible" : "auto",
            }}
          >
            {mounted.has(i) ? (
              <div className="md:max-w-5xl md:mx-auto w-full pb-28">
                <Screen />
              </div>
            ) : null}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
