import type { CSSProperties } from "react";

interface MaterialSymbolProps {
  icon: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function MaterialSymbol({ icon, size, className = "", style }: MaterialSymbolProps) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={size !== undefined ? { fontSize: size, ...style } : style}
    >
      {icon}
    </span>
  );
}
