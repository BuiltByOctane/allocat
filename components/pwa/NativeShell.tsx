"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

/**
 * Native-only shell behaviours:
 *  - Android hardware/gesture back button navigates browser history instead of
 *    closing the app, exiting only when there's nowhere left to go back to.
 *  - OAuth deep-link: Google sign-in opens in a Custom Tab and returns via the
 *    com.octane.allocat://auth/callback?code=... scheme. We close the tab and
 *    route the code through the in-WebView /auth/callback so the server exchange
 *    runs in the WebView cookie jar (where the PKCE verifier lives).
 */
export function NativeShell() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Native splash is held (launchAutoHide:false) until the WebView is ready.
    // Now that the web layer has mounted, hide it — with a frame's delay so the
    // first paint lands underneath before the splash fades out.
    (async () => {
      const { SplashScreen } = await import("@capacitor/splash-screen");
      requestAnimationFrame(() =>
        requestAnimationFrame(() => void SplashScreen.hide({ fadeOutDuration: 250 }))
      );
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
    (async () => {
      const { App } = await import("@capacitor/app");
      backHandle = await App.addListener("backButton", ({ canGoBack }) => {
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
      void backHandle?.remove();
      void urlHandle?.remove();
      themeObserver?.disconnect();
    };
  }, []);

  return null;
}
