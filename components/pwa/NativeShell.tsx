"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

/**
 * Native-only shell behaviours:
 *  - Android hardware/gesture back button navigates browser history instead of
 *    closing the app, exiting only when there's nowhere left to go back to.
 *  - OAuth deep-link: Google sign-in opens in a Custom Tab and returns via the
 *    app.allocat.mobile://auth/callback?code=... scheme. We close the tab and
 *    route the code through the in-WebView /auth/callback so the server exchange
 *    runs in the WebView cookie jar (where the PKCE verifier lives).
 */
export function NativeShell() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

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
        if (!url.startsWith("app.allocat.mobile://auth/callback")) return;
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
    };
  }, []);

  return null;
}
