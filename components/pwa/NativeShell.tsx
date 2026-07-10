"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";
import { closeTopSheet } from "@/lib/native/sheetRegistry";
import { FeedbackSheet } from "@/components/feedback/FeedbackSheet";

// Ask-on-resume feedback prompt: rate-limited so we never nag. Stores the last
// time we asked in localStorage; only fires again after the interval.
const FEEDBACK_ASKED_KEY = "allocat-feedback-asked-at";
const FEEDBACK_INTERVAL_MS = 5 * 24 * 60 * 60 * 1000; // ~5 days
// Don't pounce the moment a brand-new install resumes — seed the timer on first
// run so the earliest prompt is one interval out.
function shouldAskFeedback(): boolean {
  try {
    const raw = localStorage.getItem(FEEDBACK_ASKED_KEY);
    if (!raw) {
      localStorage.setItem(FEEDBACK_ASKED_KEY, String(Date.now()));
      return false;
    }
    return Date.now() - Number(raw) > FEEDBACK_INTERVAL_MS;
  } catch {
    return false;
  }
}

/**
 * Native-only shell behaviours:
 *  - Android hardware/gesture back button navigates browser history instead of
 *    closing the app, exiting only when there's nowhere left to go back to.
 *  - OAuth deep-link: Google sign-in opens in a Custom Tab and returns via the
 *    com.octane.allocat://auth/callback?code=... scheme. We close the tab and
 *    route the code through the in-WebView /auth/callback so the server exchange
 *    runs in the WebView cookie jar (where the PKCE verifier lives).
 *  - Ask-on-resume feedback: when the app comes back to the foreground and it's
 *    been a while since we last asked (and the user is signed in), open the
 *    FeedbackSheet. Unobtrusive and rate-limited.
 */
export function NativeShell() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Native splash is held (launchAutoHide:false) until the WebView is ready.
    // Now that the web layer has mounted, hide it — with a frame's delay so the
    // first paint lands underneath before the splash fades out.
    let splashHidden = false;
    let splashFallback: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const { SplashScreen } = await import("@capacitor/splash-screen");
      const hide = () => {
        if (splashHidden) return;
        splashHidden = true;
        void SplashScreen.hide({ fadeOutDuration: 250 });
      };
      requestAnimationFrame(() => requestAnimationFrame(hide));
      // Safety net: if the RAF chain never fires (WebView throttled while still
      // warming up), force-hide so the splash can't stick indefinitely — the
      // root cause testers saw as "stuck on the splash for a long time".
      splashFallback = setTimeout(hide, 8000);
    })();

    // Reliable system-bar theming on Android 15+, where the OS forces
    // edge-to-edge. With SystemBars insetsHandling:"css" (capacitor.config.ts)
    // the WebView draws BEHIND the transparent bars, so the bar zones show the
    // real page background — whatever in-app theme or accent is active, because
    // that's literally the web pixels underneath. No native colour guess.
    //
    // Here we only flip the bar *icons* light/dark to stay legible against the
    // actual <html>.dark state (the static config `style` can't track the in-app
    // theme toggle). SystemBars lives in @capacitor/core, not a separate plugin.
    let themeObserver: MutationObserver | undefined;
    (async () => {
      const { SystemBars, SystemBarsStyle } = await import("@capacitor/core");
      const apply = () => {
        const dark = document.documentElement.classList.contains("dark");
        // Dark = light icons (for a dark bg); Light = dark icons (for a light bg).
        const style = dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
        void SystemBars.setStyle({ style });
      };
      apply();
      themeObserver = new MutationObserver(apply);
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    })();

    let backHandle: PluginListenerHandle | undefined;
    let urlHandle: PluginListenerHandle | undefined;
    let resumeHandle: PluginListenerHandle | undefined;
    let pauseHandle: PluginListenerHandle | undefined;
    (async () => {
      const { App } = await import("@capacitor/app");

      // On resume, maybe prompt for feedback (rate-limited + auth-gated). The
      // "pause" listener is registered too so any future pause-time bookkeeping
      // has a home; it's a no-op for now.
      pauseHandle = await App.addListener("pause", () => {});
      resumeHandle = await App.addListener("resume", () => {
        if (!shouldAskFeedback()) return;
        void (async () => {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) return;
          try {
            localStorage.setItem(FEEDBACK_ASKED_KEY, String(Date.now()));
          } catch {
            /* ignore */
          }
          setFeedbackOpen(true);
        })();
      });

      backHandle = await App.addListener("backButton", ({ canGoBack }) => {
        // A bottom sheet / modal open? Let it consume the back press — close it
        // instead of navigating (the old behaviour changed the page out from
        // under an open sheet). Custom portals (e.g. the emoji picker) register
        // on the sheet stack; vaul/Radix dialogs close on a synthetic Escape via
        // Radix's DismissableLayer document listener.
        if (closeTopSheet()) return;
        const openDialog = document.querySelector(
          '[vaul-drawer][data-state="open"], [role="dialog"][data-state="open"]'
        );
        if (openDialog) {
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
          );
          return;
        }
        if (canGoBack || window.history.length > 1) {
          window.history.back();
        } else {
          void App.exitApp();
        }
      });

      urlHandle = await App.addListener("appUrlOpen", async ({ url }) => {
        if (!url.startsWith("com.octane.allocat://auth/callback")) return;
        const { Browser } = await import("@capacitor/browser");
        void Browser.close();

        // Custom-scheme URLs aren't valid bases for URL(); normalise to https
        // just to parse out the OAuth params.
        const params = new URL(url.replace(/^app\.allocat\.mobile:\/\//, "https://")).searchParams;
        const code = params.get("code");
        if (code) {
          const next = params.get("next");
          window.location.assign(
            `/auth/callback?code=${encodeURIComponent(code)}${next ? `&next=${encodeURIComponent(next)}` : ""}`
          );
        } else {
          window.location.assign("/auth/login?error=Could not authenticate user");
        }
      });
    })();

    return () => {
      if (splashFallback) clearTimeout(splashFallback);
      void backHandle?.remove();
      void urlHandle?.remove();
      void resumeHandle?.remove();
      void pauseHandle?.remove();
      themeObserver?.disconnect();
    };
  }, []);

  return <FeedbackSheet isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />;
}
