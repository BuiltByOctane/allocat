"use client";

import { useEffect } from "react";
import { useSyncContext } from "@/lib/providers/SyncProvider";

type BadgingNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function BadgeUpdater() {
  const { pendingCount } = useSyncContext();

  useEffect(() => {
    const nav = navigator as BadgingNavigator;
    if (typeof nav.setAppBadge !== "function") return;

    const capped = Math.min(pendingCount, 99);
    if (capped > 0) {
      nav.setAppBadge(capped).catch(() => {});
    } else {
      nav.clearAppBadge?.().catch(() => {});
    }
  }, [pendingCount]);

  return null;
}
