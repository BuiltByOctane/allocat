"use client";

import { useEffect, useState } from "react";

interface TourBannerProps {
  title: string;
  description: string;
  onDismiss: () => void;
}

export default function TourBanner({ title, description, onDismiss }: TourBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  function handleDismiss() {
    setVisible(false);
    window.setTimeout(onDismiss, 220);
  }

  return (
    <div
      className="mx-4 mb-0 mt-4 transition-all duration-200"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-6px)",
      }}
    >
      <div className="rounded-card bg-[var(--pill)] text-[var(--pill-foreground)] px-5 py-4">
        {/* Label row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="t-label opacity-60 mb-1">Guide</div>
            <div className="text-[15px] font-bold tracking-[-0.01em]">
              {title}
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Skip guide"
            className="shrink-0 mt-0.5 text-[11px] font-bold opacity-50 hover:opacity-100 transition-opacity"
          >
            Skip
          </button>
        </div>

        {/* Description */}
        <p className="text-sm leading-relaxed opacity-75 mb-4">
          {description}
        </p>

        {/* CTA */}
        <button
          type="button"
          onClick={handleDismiss}
          className="w-full h-[44px] rounded-pill bg-[var(--accent)] text-[var(--accent-ink)] text-[13px] font-bold hover:brightness-95 active:scale-[0.98] transition-all"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
