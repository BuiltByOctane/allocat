"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { useSync } from "@/lib/hooks/useSync";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { hydrateAllTables } from "@/lib/db/hydrate";

// dotLottie renders a <canvas> + wasm — client only, so load with ssr:false.
const DotLottieReact = dynamic(
  () => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact),
  { ssr: false }
);
type DotLottieInstance = import("@lottiefiles/dotlottie-react").DotLottie;

// Cat-peeking loader. The source art looks "out" from the bottom edge, so we
// flip it vertically (scaleY -1) to peek down from the top as it descends.
const CAT_LOTTIE_SRC = "/lottie/cat-loading-lottie.json";

// Cat puns shown while refreshing — cycled every ~900ms.
const CAT_MESSAGES = [
  "herding cats…",
  "purr-ocessing…",
  "chasing the data…",
  "one paw-ment…",
  "cats don't fetch…",
  "almost purr-fect…",
];

const THRESHOLD = 72; // px (post-resistance) needed to trigger a refresh
const MAX_PULL = 110; // px cap on indicator travel
const RESISTANCE = 0.5; // finger-distance → indicator-distance damping

// The app shell can scroll the document (mobile, content taller than viewport)
// OR an inner `overflow-auto` element (desktop `<main>`). Walk up from the touch
// target to find whatever actually scrolls; null → the document/window scrolls.
function scrollableAncestor(start: HTMLElement | null): HTMLElement | null {
  let node = start;
  while (node && node !== document.body && node !== document.documentElement) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function topOffset(start: HTMLElement | null): number {
  const sc = scrollableAncestor(start);
  if (sc) return sc.scrollTop;
  return window.scrollY || document.documentElement.scrollTop || 0;
}

// Minimal monochrome cat face — inherits `currentColor`, no emoji to clash with
// the editorial palette. Eyes close into a content squint while refreshing.
function CatFace({ refreshing }: { refreshing: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 10 L8 4.5 L14 8" />
      <path d="M22 10 L24 4.5 L18 8" />
      <ellipse cx="16" cy="17" rx="9" ry="8" />
      {refreshing ? (
        <>
          <path d="M11.5 16 q1.5 1.6 3 0" />
          <path d="M17.5 16 q1.5 1.6 3 0" />
        </>
      ) : (
        <>
          <circle cx="13" cy="16" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="19" cy="16" r="0.9" fill="currentColor" stroke="none" />
        </>
      )}
      <path d="M15.1 19 L16.9 19 L16 20.1 Z" fill="currentColor" stroke="none" />
      <path d="M7 17.5 L11 18 M7 19.5 L11 19" />
      <path d="M25 17.5 L21 18 M25 19.5 L21 19" />
    </svg>
  );
}

// Inverted cat-peeking Lottie whenever the indicator is visible (pull or
// refresh). Falls back to the SVG cat if the asset fails to load.
function RefreshCat({
  refreshing,
  progress,
}: {
  refreshing: boolean;
  progress: number;
}) {
  const [lottieFailed, setLottieFailed] = useState(false);

  // dotLottie has no onError prop — listen for `loadError` on the instance so a
  // missing/broken asset falls back to the SVG cat.
  const onRef = useCallback((dl: DotLottieInstance | null) => {
    dl?.addEventListener("loadError", () => setLottieFailed(true));
  }, []);

  if (!lottieFailed) {
    return (
      // Flip vertically so the cat peeks down from above.
      <div className="size-16" style={{ transform: "scaleY(-1)" }}>
        <DotLottieReact
          src={CAT_LOTTIE_SRC}
          loop
          autoplay
          className="size-full"
          dotLottieRefCallback={onRef}
        />
      </div>
    );
  }

  return (
    <motion.div
      animate={refreshing ? { y: [0, -3, 0] } : { y: 0 }}
      transition={
        refreshing
          ? { repeat: Infinity, duration: 0.6, ease: "easeInOut" }
          : { duration: 0 }
      }
      style={{
        transform: refreshing ? undefined : `scale(${0.7 + progress * 0.3})`,
      }}
    >
      <CatFace refreshing={refreshing} />
    </motion.div>
  );
}

/**
 * App-wide pull-to-refresh. Listens on `window` so it works whether the document
 * or an inner element scrolls. On a downward drag past the threshold from the top
 * it re-pulls all tables from the server and refetches the visible page.
 * Inert on desktop (no touch events fire).
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const { isOnline } = useSync();
  const qc = useQueryClient();
  const haptic = useHaptic();

  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);

  // Cycle the cat puns while a refresh is in flight.
  useEffect(() => {
    if (!refreshing) return;
    const id = setInterval(
      () => setMsgIndex((i) => (i + 1) % CAT_MESSAGES.length),
      900
    );
    return () => clearInterval(id);
  }, [refreshing]);

  // Refs mirror state so the native listeners read fresh values without
  // re-subscribing every render.
  const startY = useRef(0);
  const pulling = useRef(false);
  const crossed = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  const doRefresh = useCallback(async () => {
    if (!isOnline) {
      pullRef.current = 0;
      setPull(0);
      return;
    }
    refreshingRef.current = true;
    setRefreshing(true);
    pullRef.current = THRESHOLD; // hold the cat near the top while syncing
    setPull(THRESHOLD);
    haptic.medium();
    try {
      await hydrateAllTables();
      await qc.refetchQueries({ type: "active" });
    } catch (e) {
      console.warn("[PullToRefresh] refresh failed", e);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      pullRef.current = 0;
      setPull(0);
    }
  }, [isOnline, qc, haptic]);

  useEffect(() => {
    const reset = () => {
      pulling.current = false;
      if (pullRef.current !== 0) {
        pullRef.current = 0;
        setPull(0);
      }
    };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      const target = e.target as HTMLElement;
      if (topOffset(target) <= 0) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
        crossed.current = false;
      } else {
        pulling.current = false;
      }
    };

    const onMove = (e: TouchEvent) => {
      if (!pulling.current || refreshingRef.current) return;
      const delta = e.touches[0].clientY - startY.current;
      // Any upward move, or no longer at the top → it's a scroll, not a pull.
      // Disarm and never touch the event (listeners are passive — native scroll
      // is never blocked).
      if (delta <= 0 || topOffset(e.target as HTMLElement) > 0) {
        reset();
        return;
      }
      // Pulling down at the top. We don't preventDefault — overscroll-behavior
      // suppresses the bounce, and there's nothing above to scroll to, so the
      // indicator just overlays.
      const resisted = Math.min(delta * RESISTANCE, MAX_PULL);
      pullRef.current = resisted;
      setPull(resisted);
      if (!crossed.current && resisted >= THRESHOLD) {
        crossed.current = true;
        haptic.light();
      }
    };

    const onEnd = () => {
      if (!pulling.current) return;
      pulling.current = false;
      if (pullRef.current >= THRESHOLD && isOnline && !refreshingRef.current) {
        void doRefresh();
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [isOnline, doRefresh, haptic]);

  const progress = Math.min(pull / THRESHOLD, 1);
  const shown = pull > 2 || refreshing;

  return (
    <>
      <motion.div
        className="pointer-events-none fixed left-1/2 top-0 z-[60] flex flex-col items-center gap-1 text-foreground"
        // Cat peeks down from above — starts hidden over the top edge, descends
        // with the pull, then settles while refreshing.
        animate={{
          x: "-50%",
          y: shown ? pull * 0.6 : -72,
          opacity: shown ? 1 : 0,
        }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <RefreshCat refreshing={refreshing} progress={progress} />
        {refreshing && (
          <motion.span
            key={msgIndex}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[9px] tracking-[0.14em] uppercase text-foreground shadow-sm"
          >
            {CAT_MESSAGES[msgIndex]}
          </motion.span>
        )}
      </motion.div>
      {children}
    </>
  );
}
