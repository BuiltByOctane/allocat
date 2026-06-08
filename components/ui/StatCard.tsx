import type { ReactNode } from "react";

/**
 * The health-app "stat pair" card: an icon tile top-left, an optional status
 * chip top-right, then a small label + big figure at the bottom. Comes in a
 * dark (ink) and light (white) tone — pair them side by side.
 */
export function StatCard({
  tone = "light",
  icon,
  chip,
  label,
  value,
  footer,
  onClick,
  className = "",
}: {
  tone?: "dark" | "light";
  icon?: ReactNode;
  chip?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  /** Extra content under the figure (sparkline, sub-bar, etc). */
  footer?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const dark = tone === "dark";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={[
        "flex flex-col justify-between rounded-stat p-3.5 text-left min-h-[116px]",
        dark ? "bg-[var(--pill)] text-[var(--pill-foreground)]" : "bg-card text-card-foreground",
        onClick ? "active:scale-[0.98] transition-transform" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start justify-between">
        {icon != null && (
          <span
            className={`flex h-[30px] w-[30px] items-center justify-center rounded-[9px] ${
              dark ? "bg-white/[0.12] text-[var(--pill-foreground)]" : "bg-tile text-foreground"
            }`}
          >
            {icon}
          </span>
        )}
        {chip}
      </div>
      <div>
        <div className={`text-[10.5px] font-medium ${dark ? "text-white/60" : "text-muted-foreground"}`}>
          {label}
        </div>
        <div className="figure text-[20px] mt-0.5">{value}</div>
        {footer}
      </div>
    </Tag>
  );
}
