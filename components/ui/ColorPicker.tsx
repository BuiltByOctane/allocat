"use client";

import { CAT_KEYS, catVar, type CatKey } from "@/lib/theme/dataViz";
import { useHaptic } from "@/lib/hooks/useHaptic";

interface ColorPickerProps {
  /** Currently assigned palette key, or null for the deterministic default. */
  value: CatKey | null;
  onChange: (value: CatKey | null) => void;
  className?: string;
}

/** 8 palette swatches + an "Auto" chip that clears the assignment (null). */
export function ColorPicker({ value, onChange, className = "" }: ColorPickerProps) {
  const haptic = useHaptic();

  const select = (key: CatKey | null) => {
    haptic.selection();
    onChange(key);
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => select(null)}
        aria-label="Automatic color"
        aria-pressed={value === null}
        className={`h-7 px-2 rounded-full t-label-sm border transition-colors ${
          value === null
            ? "border-foreground text-foreground"
            : "border-border text-muted-foreground hover:border-foreground/40"
        }`}
      >
        Auto
      </button>
      {CAT_KEYS.map((key) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => select(key)}
            aria-label={`Color ${key}`}
            aria-pressed={active}
            className={`size-7 rounded-full transition-transform active:scale-90 ${
              active ? "ring-2 ring-offset-2 ring-offset-card ring-foreground" : ""
            }`}
            style={{ background: catVar(key) }}
          />
        );
      })}
    </div>
  );
}
