/**
 * Two-tone daily bar chart (e.g. installs up / uninstalls down). Pure CSS grid
 * — no SVG scaling games, and it stays legible at 90 bars wide.
 */
export function BarSeries({
  data,
  height = 120,
  className = "",
}: {
  data: Array<{ label: string; up: number; down?: number }>;
  height?: number;
  className?: string;
}) {
  if (data.length === 0) {
    return (
      <div
        style={{ height }}
        className={`flex items-center justify-center rounded-tile bg-tile t-body-sm text-muted-foreground ${className}`}
      >
        No data yet
      </div>
    );
  }

  const max = Math.max(1, ...data.map((d) => Math.max(d.up, d.down ?? 0)));

  return (
    <div className={`overflow-x-auto ${className}`}>
      <div className="flex items-end gap-[2px] min-w-full" style={{ height }}>
        {data.map((d) => (
          <div
            key={d.label}
            className="group relative flex flex-1 min-w-[3px] flex-col justify-end gap-[1px]"
            title={`${d.label} · +${d.up}${d.down !== undefined ? ` / −${d.down}` : ""}`}
          >
            <div
              className="rounded-[2px] bg-[var(--pos)]"
              style={{ height: `${(d.up / max) * (height - 20)}px` }}
            />
            {d.down !== undefined && d.down > 0 && (
              <div
                className="rounded-[2px] bg-[var(--neg)] opacity-70"
                style={{ height: `${(d.down / max) * (height - 20)}px` }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
