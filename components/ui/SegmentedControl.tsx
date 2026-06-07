"use client";

import { useHaptic } from "@/lib/hooks/useHaptic";

export interface SegmentOption<T extends string> {
  label: string;
  value: T;
  count?: number;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** "underline" for binary/few (tabs); "pill" for many filters (chips). */
  variant?: "underline" | "pill";
  /** Horizontal scroll for long option lists (pill variant). */
  scroll?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  variant = "underline",
  scroll = false,
  className = "",
}: SegmentedControlProps<T>) {
  const haptic = useHaptic();

  const select = (v: T) => {
    if (v !== value) haptic.selection();
    onChange(v);
  };

  if (variant === "pill") {
    return (
      <div
        role="tablist"
        className={`flex gap-2 ${scroll ? "overflow-x-auto no-scrollbar pb-1" : "flex-wrap"} ${className}`}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              role="tab"
              aria-selected={active}
              onClick={() => select(opt.value)}
              className={`shrink-0 px-3 py-1.5 t-label border transition-colors ${
                active
                  ? "bg-foreground text-background border-foreground"
                  : "bg-transparent text-muted-foreground border-border hover:border-foreground/40"
              }`}
            >
              {opt.label}
              {opt.count !== undefined && ` ${opt.count}`}
            </button>
          );
        })}
      </div>
    );
  }

  // underline
  return (
    <div role="tablist" className={`flex gap-6 border-b border-border ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => select(opt.value)}
            className={`relative -mb-px py-2.5 t-label transition-colors ${
              active
                ? "text-foreground border-b-2 border-foreground"
                : "text-muted-foreground border-b-2 border-transparent hover:text-foreground/70"
            }`}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span className="ml-1.5 opacity-60">{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
