/**
 * Inline-SVG sparkline. No charting library on purpose — the admin portal shows
 * a handful of single-series trends and recharts would be a bigger download
 * than every admin page combined.
 *
 * `preserveAspectRatio="none"` lets one viewBox stretch to any container width,
 * so the caller only ever sets height.
 */
export function Sparkline({
  values,
  height = 40,
  stroke = "var(--accent-strong)",
  fill = true,
  className = "",
}: {
  values: number[];
  height?: number;
  stroke?: string;
  fill?: boolean;
  className?: string;
}) {
  if (values.length === 0) {
    return <div style={{ height }} className={className} aria-hidden />;
  }

  const W = 100;
  const H = 30;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? W / (values.length - 1) : 0;
  // Pad the top so the peak never clips against the stroke width.
  const y = (v: number) => H - (v / max) * (H - 2) - 1;
  const pts = values.map((v, i) => `${(i * step).toFixed(2)},${y(v).toFixed(2)}`);
  const line = `M${pts.join("L")}`;
  const area = `${line}L${W},${H}L0,${H}Z`;
  const last = values[values.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      height={height}
      className={`w-full overflow-visible ${className}`}
      role="img"
      aria-label={`Trend, latest ${last}`}
    >
      {fill && <path d={area} fill={stroke} opacity="0.12" />}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {values.length > 1 && (
        <circle cx={W} cy={y(last)} r="2" fill={stroke} vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}
