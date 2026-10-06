"use client";

import posthog from "posthog-js";
import { Capacitor } from "@capacitor/core";
import { isUntrackedPath, normalizePath, sanitizeProps } from "./sanitize";

/**
 * Anonymous product analytics (PostHog).
 *
 * Runs in the web app only — the Android shell is a remote-URL WebView of the
 * same app, so this one integration covers web, installed PWA and Android
 * (told apart by the `platform` super property). No native SDK.
 *
 * Privacy contract (mirrored in /legal/privacy-policy — keep them in sync):
 * - Anonymous: never `identify()`, no user id, no email. `person_profiles:
 *   "never"`. `reset()` on sign-out so a shared device does not link accounts.
 * - Event properties are categorical only — see `sanitizeProps`.
 * - Autocapture and session replay mask ALL text, inputs and attributes, and
 *   block images, so no amount, name or avatar leaves the device.
 * - Nothing on /admin is captured.
 *
 * Every export is a no-op until `initAnalytics()` succeeds, which needs
 * `NEXT_PUBLIC_POSTHOG_KEY` — so dev, preview and tests stay silent.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const UI_HOST = process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || "https://us.posthog.com";

let started = false;

/** Feature events beyond pageviews and sync writes (see `trackWrite`). */
export type AnalyticsEvent =
  | "ai_chat_sent"
  | "onboarding_completed"
  | "tour_page_seen"
  | "accent_changed"
  | "theme_changed"
  | "currency_changed"
  | "founding_banner_dismissed"
  | "founding_claimed"
  | "shortcut_setup_opened"
  | "shortcut_key_created";

export function platform(): "android" | "pwa" | "web" {
  if (Capacitor.isNativePlatform()) return "android";
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return "pwa";
  } catch {}
  return "web";
}

export function initAnalytics(): void {
  if (started || !KEY || typeof window === "undefined") return;
  started = true;

  posthog.init(KEY, {
    // First-party proxy (next.config.ts rewrites) — survives ad-blockers.
    api_host: "/ingest",
    ui_host: UI_HOST,
    person_profiles: "never",
    persistence: "localStorage",
    // App Router navigations are client-side; AnalyticsProvider sends these.
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    // Click/scroll heatmaps are coordinates only — no element text is needed,
    // so they keep working under the masking above.
    capture_heatmaps: true,
    capture_dead_clicks: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
      blockSelector: "img, svg image, canvas",
    },
    before_send: (event) => {
      if (!event) return null;
      if (isUntrackedPath(window.location.pathname)) return null;
      // Autocapture/pageleave stamp the raw URL; collapse ids out of it.
      const props = event.properties;
      if (props) {
        if (typeof props.$current_url === "string") {
          props.$current_url = window.location.origin + normalizePath(window.location.pathname);
        }
        if (typeof props.$pathname === "string") props.$pathname = normalizePath(props.$pathname);
        if (typeof props.$prev_pageview_pathname === "string") {
          props.$prev_pageview_pathname = normalizePath(props.$prev_pageview_pathname);
        }
      }
      return event;
    },
  });

  posthog.register({
    platform: platform(),
    app_version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
  });
}

/** Runtime kill switch (`analytics_enabled` flag) for already-shipped builds. */
export function setAnalyticsEnabled(enabled: boolean): void {
  if (!started) return;
  if (enabled && posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
  else if (!enabled && !posthog.has_opted_out_capturing()) posthog.opt_out_capturing();
}

export function trackPageview(pathname: string): void {
  if (!started || isUntrackedPath(pathname)) return;
  const path = normalizePath(pathname);
  posthog.capture("$pageview", {
    $current_url: window.location.origin + path,
    $pathname: path,
  });
}

export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (!started) return;
  posthog.capture(event, sanitizeProps(props));
}

/**
 * Every user write goes through the sync queue as a `(table, operation)` pair,
 * so this one call (from `useEnqueue`) is the feature-usage signal for the whole
 * app: `budget_items_insert`, `debts_payment`, `goals_achieve`,
 * `sms_transactions_categorize`, … No payload is ever read.
 */
export function trackWrite(table: string, operation: string): void {
  if (!started) return;
  posthog.capture(`${table}_${operation.toLowerCase()}`, { table, op: operation.toLowerCase() });
}

/** New anonymous id — call on sign-out / account switch. */
export function resetAnalytics(): void {
  if (!started) return;
  posthog.reset();
}
