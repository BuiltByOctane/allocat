"use client";

import { useSync } from "@/lib/hooks/useSync";

export function SyncStatusBadge() {
  const { pendingCount, isOnline } = useSync();

  // Nothing to show when fully synced and online
  if (isOnline && pendingCount === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-card border border-border">
      {!isOnline ? (
        <>
          <span className="size-2 rounded-full bg-neg shrink-0" />
          <span className="text-[10px] font-medium text-muted-foreground">
            Offline
          </span>
        </>
      ) : pendingCount > 0 ? (
        <>
          {/* Spinning sync indicator */}
          <svg
            className="size-3 animate-spin text-primary shrink-0"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 100 20v-4l-3 3 3 3v-4a8 8 0 01-8-8z"
            />
          </svg>
          <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
            {pendingCount}
          </span>
        </>
      ) : null}
    </div>
  );
}
