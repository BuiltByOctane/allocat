"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHaptic } from "@/lib/hooks/useHaptic";

export interface DeckSlide {
  key: string;
  content: ReactNode;
  /** Hide the built-in Next button (the final action slide renders its own CTAs). */
  hideNext?: boolean;
}

/**
 * Swipeable onboarding deck. Drag horizontally or use the Next/Back buttons and
 * progress dots. Honors prefers-reduced-motion (cross-fades, no drag/parallax).
 */
export function OnboardingDeck({ slides }: { slides: DeckSlide[] }) {
  const reduce = useReducedMotion();
  const haptic = useHaptic();
  const [[page, dir], setPage] = useState<[number, number]>([0, 0]);

  const last = slides.length - 1;
  const current = Math.max(0, Math.min(page, last));
  const slide = slides[current];

  const paginate = (delta: number) => {
    const next = current + delta;
    if (next < 0 || next > last) return;
    haptic.selection();
    setPage([next, delta]);
  };
  const goTo = (i: number) => {
    if (i === current) return;
    haptic.selection();
    setPage([i, i > current ? 1 : -1]);
  };

  const variants = {
    enter: (d: number) => ({ x: reduce ? 0 : d > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: reduce ? 0 : d > 0 ? "-100%" : "100%", opacity: 0 }),
  };

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#0a0a0a] text-white">
      {/* Ambient lime glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-12%] h-[55%] w-[130%] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(182,232,74,0.14),transparent_70%)]"
      />

      {/* Skip — jumps to the final budget step (which has its own skip). */}
      <div className="relative z-10 flex justify-end px-7 pt-5">
        <button
          type="button"
          onClick={() => goTo(last)}
          className={`py-1 text-xs font-bold uppercase tracking-widest text-white/45 transition hover:text-white/80 ${
            current === last ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          Skip
        </button>
      </div>

      {/* Card stage */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence custom={dir} initial={false}>
          <motion.div
            key={slide.key}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={
              reduce
                ? { duration: 0.2 }
                : {
                    x: { type: "spring", stiffness: 320, damping: 34 },
                    opacity: { duration: 0.25 },
                  }
            }
            drag={reduce ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.16}
            onDragEnd={(_e, info) => {
              const power = info.offset.x + info.velocity.x * 0.25;
              if (power < -90) paginate(1);
              else if (power > 90) paginate(-1);
            }}
            className="absolute inset-0 flex touch-pan-y items-stretch"
          >
            {slide.content}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="relative z-10 flex items-center justify-between gap-4 px-7 pb-10 pt-3">
        <button
          type="button"
          onClick={() => paginate(-1)}
          aria-label="Back"
          className={`flex size-11 items-center justify-center rounded-full border border-white/15 text-white/70 transition active:scale-95 ${
            current === 0 ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
        </button>

        <div className="flex items-center gap-2">
          {slides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={`Go to step ${i + 1}`}
              onClick={() => goTo(i)}
              className="py-2"
            >
              <motion.span
                className={`block h-[6px] rounded-full ${
                  i === current ? "bg-accent-strong" : "bg-white"
                }`}
                animate={{
                  width: i === current ? 24 : 6,
                  opacity: i === current ? 1 : 0.3,
                }}
                transition={{ duration: 0.3 }}
              />
            </button>
          ))}
        </div>

        {slide.hideNext ? (
          <span className="size-11" aria-hidden />
        ) : (
          <button
            type="button"
            onClick={() => paginate(1)}
            aria-label="Next"
            className="flex size-11 items-center justify-center rounded-full bg-accent text-[var(--accent-ink)] transition active:scale-95"
          >
            <span className="material-symbols-outlined text-lg">arrow_forward</span>
          </button>
        )}
      </div>
    </div>
  );
}
