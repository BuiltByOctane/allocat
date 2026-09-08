import type { ReactNode } from "react";

/**
 * Dense metric tile for the admin grid.
 *
 * Deliberately not `components/ui/StatCard` — that one is tuned for the 480px
 * mobile shell (116px tall, icon well, paired side by side). The portal is a
 * desktop scan surface where a dozen numbers need to fit above the fold.
 */
export function Tile({
  label,
  value,
  sub,
  tone = "default",
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "accent" | "warn";
  children?: ReactNode;
}) {
  return (
    <div className="rounded-stat bg-card p-4 flex flex-col gap-1">
      <div className="t-label-sm text-muted-foreground">{label}</div>
      <div
        className={[
          "figure text-[26px] font-mono",
          tone === "accent" ? "text-[var(--accent-strong)]" : "",
          tone === "warn" ? "text-warn" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </div>
      {sub && <div className="t-body-sm text-muted-foreground">{sub}</div>}
      {children}
    </div>
  );
}
