"use client";

import { appSourceDisplay } from "@/lib/sms/appSource";

/**
 * Tiny subtle chip naming the originating UPI/payment app of a transaction
 * (derived on-device from the SMS sender — see lib/sms/appSource.ts). Renders
 * nothing when the source is null/unknown.
 */
export function AppSourceBadge({
  source,
  className = "",
}: {
  source: string | null | undefined;
  className?: string;
}) {
  const display = appSourceDisplay(source);
  if (!display) return null;
  return (
    <span
      className={`shrink-0 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide leading-none ${className}`}
      style={{
        color: display.color,
        borderColor: `color-mix(in srgb, ${display.color} 40%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${display.color} 9%, transparent)`,
      }}
    >
      {display.label}
    </span>
  );
}
