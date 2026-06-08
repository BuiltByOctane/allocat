import { forwardRef, type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Tighter padding for list-row cards. */
  compact?: boolean;
  /** Render the dark (ink) card instead of white. */
  tone?: "default" | "ink";
}

/** The Neo · Lime base surface: rounded white (or ink) card. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { compact, tone = "default", className = "", children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={[
        "rounded-card",
        compact ? "p-3.5" : "p-[17px]",
        tone === "ink"
          ? "bg-[var(--pill)] text-[var(--pill-foreground)]"
          : "bg-card text-card-foreground",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
});
