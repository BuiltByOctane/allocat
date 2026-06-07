"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { MaterialSymbol } from "./MaterialSymbol";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  /** Required — icon-only buttons must be labelled for screen readers. */
  "aria-label": string;
  /** Visual icon size in px (default 22). Touch target stays 44px regardless. */
  iconSize?: number;
  filled?: boolean;
}

/**
 * Icon-only button. Visual glyph is small/quiet but the hit area is a full
 * 44px touch target (negative margin keeps it from disturbing layout).
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { icon, iconSize = 22, filled, className = "", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-muted-foreground hover:text-foreground active:scale-90 transition-all rounded-lg ${className}`}
        {...props}
      >
        <MaterialSymbol
          icon={icon}
          className={`${filled ? "filled " : ""}`.trim()}
          style={{ fontSize: iconSize }}
        />
      </button>
    );
  },
);
