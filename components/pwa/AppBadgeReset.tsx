"use client";

import { useEffect } from "react";

type BadgingNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
};

/**
 * Clears the OS app-icon badge once per launch.
 *
 * The sync-pending badge (BadgeUpdater) is gone, but an installed PWA keeps
 * whatever count the previous build set until something clears it — so a user
 * upgrading would be stuck with a permanent number on the icon.
 */
export function AppBadgeReset() {
  useEffect(() => {
    (navigator as BadgingNavigator).clearAppBadge?.().catch(() => {});
  }, []);

  return null;
}
