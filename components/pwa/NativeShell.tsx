"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

/**
 * Native-only shell behaviours. Currently: make the Android hardware/gesture
 * back button navigate browser history instead of closing the app, exiting
 * only when there's nowhere left to go back to.
 */
export function NativeShell() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let handle: PluginListenerHandle | undefined;
    (async () => {
      const { App } = await import("@capacitor/app");
      handle = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack || window.history.length > 1) {
          window.history.back();
        } else {
          void App.exitApp();
        }
      });
    })();

    return () => {
      void handle?.remove();
    };
  }, []);

  return null;
}
