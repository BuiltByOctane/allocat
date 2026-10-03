"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAppFlags } from "@/lib/hooks/useAppFlags";
import { initAnalytics, setAnalyticsEnabled, trackPageview } from "@/lib/analytics/client";
import { isUntrackedPath } from "@/lib/analytics/sanitize";

/** Boots PostHog once and sends a `$pageview` per App Router navigation. */
export function AnalyticsProvider() {
  const pathname = usePathname();
  const { analytics_enabled } = useAppFlags();

  useEffect(() => {
    // Never load the SDK when the session starts on the admin portal.
    if (isUntrackedPath(window.location.pathname)) return;
    initAnalytics();
  }, []);

  useEffect(() => {
    setAnalyticsEnabled(analytics_enabled);
  }, [analytics_enabled]);

  useEffect(() => {
    if (pathname) trackPageview(pathname);
  }, [pathname]);

  return null;
}
