interface SkeletonProps {
  className?: string;
  /** Convenience: render `count` stacked bars with a gap. */
  count?: number;
}

/** Pulsing placeholder block. Compose with width/height utilities. */
export function Skeleton({ className = "", count }: SkeletonProps) {
  if (count && count > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={`bg-muted/60 animate-pulse rounded ${className}`} />
        ))}
      </div>
    );
  }
  return <div className={`bg-muted/60 animate-pulse rounded ${className}`} />;
}
