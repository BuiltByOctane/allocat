"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, type Transition } from "motion/react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { navItems, hrefForPath } from "@/lib/nav/navItems";

// Horizontal drift (px) before a press turns into a scrub-slide. Small so it
// feels instant, but large enough that a plain tap never engages. The gesture
// also requires horizontal dominance (|dx| > |dy|) so a vertical drag near the
// dock doesn't get hijacked into a scrub.
const ENGAGE_PX = 7;
const PAD = 6; // nav padding (p-1.5)

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export default function BottomNav() {
  const pathname = usePathname();
  const haptic = useHaptic();
  const router = useRouter();
  const reduce = useReducedMotion();

  // Optimistic active tab: flips the instant you tap (before the route commits),
  // so the pill slides immediately instead of waiting on navigation.
  const [active, setActive] = useState(() => hrefForPath(pathname));
  // Purely for the "grabbed" scale feedback while sliding.
  const [scrubbing, setScrubbing] = useState(false);

  const navRef = useRef<HTMLElement | null>(null);

  // Gesture bookkeeping (refs so pointer handlers read the latest value).
  const pointerId = useRef<number | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const lastX = useRef(0);
  const scrubbingRef = useRef(false);
  const justScrubbed = useRef(false); // swallow the click that follows a scrub
  const activeIdx = useRef(0);

  useEffect(() => {
    setActive(hrefForPath(pathname));
  }, [pathname]);

  useEffect(() => {
    navItems.forEach((item) => router.prefetch(item.href));
  }, [router]);

  const spring: Transition = reduce
    ? { duration: 0 }
    : { type: "spring", stiffness: 520, damping: 42, mass: 0.7 };

  // --- Slider gesture --------------------------------------------------------
  // Fixed equal-width hit zones (stable even as the active pill expands, so the
  // selection never oscillates near a boundary).
  const zoneFor = (localX: number, width: number) => {
    const inner = width - 2 * PAD;
    return clamp(Math.floor((localX - PAD) / (inner / navItems.length)), 0, navItems.length - 1);
  };

  const selectIdx = (idx: number, withHaptic: boolean) => {
    if (idx === activeIdx.current) return;
    activeIdx.current = idx;
    const href = navItems[idx].href;
    setActive(href);
    if (hrefForPath(pathname) !== href) router.push(href);
    if (withHaptic) haptic.selectionChanged();
  };

  const engageScrub = () => {
    const nav = navRef.current;
    if (!nav || pointerId.current == null) return;
    try {
      nav.setPointerCapture(pointerId.current);
    } catch {
      // capture is best-effort
    }
    scrubbingRef.current = true;
    setScrubbing(true);
    haptic.light();
    haptic.selectionStart();
    const r = nav.getBoundingClientRect();
    activeIdx.current = zoneFor(lastX.current - r.left, r.width);
    selectIdx(activeIdx.current, false);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (reduce) return;
    justScrubbed.current = false;
    pointerId.current = e.pointerId;
    startX.current = e.clientX;
    startY.current = e.clientY;
    lastX.current = e.clientX;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (reduce) return;
    lastX.current = e.clientX;

    if (!scrubbingRef.current) {
      // Engage the scrub as soon as the finger moves horizontally past the
      // threshold (no long-press wait). Require horizontal dominance so a
      // vertical drag near the dock doesn't get hijacked into a scrub.
      if (pointerId.current == null) return;
      const dx = e.clientX - startX.current;
      const dy = e.clientY - startY.current;
      if (Math.abs(dx) > ENGAGE_PX && Math.abs(dx) > Math.abs(dy)) engageScrub();
      return;
    }

    const nav = navRef.current;
    if (!nav) return;
    const r = nav.getBoundingClientRect();
    selectIdx(zoneFor(e.clientX - r.left, r.width), true);
  };

  const endGesture = () => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    justScrubbed.current = true; // prevent the synthetic click from re-navigating
    setScrubbing(false);
    haptic.selectionEnd();
    const nav = navRef.current;
    if (nav && pointerId.current != null) {
      try {
        nav.releasePointerCapture(pointerId.current);
      } catch {
        // ignore
      }
    }
    pointerId.current = null;
  };

  return (
    <motion.nav
      ref={navRef}
      layout
      transition={spring}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      animate={reduce ? undefined : { scale: scrubbing ? 1.04 : 1 }}
      className="flex min-h-14 items-center gap-[5px] p-1.5 rounded-nav glass-dock backdrop-filter backdrop-blur-sm bg-opacity-0"
      style={{ touchAction: "none" }}
    >
      {navItems.map((item) => {
        const isActive = active === item.href;
        const { Icon } = item;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            onClick={(e) => {
              if (justScrubbed.current) {
                e.preventDefault();
                return;
              }
              setActive(item.href);
              haptic.light();
            }}
            className="relative flex items-center justify-center"
            draggable={false}
          >
            <motion.span
              layout
              transition={spring}
              className={`relative flex items-center justify-center ${
                isActive ? "h-11 gap-1.5 rounded-[22px] px-3.5" : "size-9 rounded-full"
              }`}
              style={{ willChange: "transform" }}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 z-0 rounded-[22px] bg-[var(--navpill)]"
                  transition={spring}
                  style={{ willChange: "transform" }}
                />
              )}
              {!isActive && (
                <span className="absolute inset-0 z-0 rounded-full bg-[var(--nav-circle)] shadow-[0_2px_6px_rgba(0,0,0,0.08)]" />
              )}
              <motion.span layout transition={spring} className="relative z-10 flex items-center justify-center">
                <Icon
                  size={18}
                  strokeWidth={isActive ? 2 : 1.8}
                  className={isActive ? "text-[var(--navpill-foreground)]" : "text-[var(--nav-circle-foreground)]"}
                />
              </motion.span>
              {isActive && (
                <motion.span
                  layout
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="relative z-10 whitespace-nowrap text-[12.5px] font-semibold text-[var(--navpill-foreground)]"
                >
                  {item.label}
                </motion.span>
              )}
            </motion.span>
          </Link>
        );
      })}
    </motion.nav>
  );
}
