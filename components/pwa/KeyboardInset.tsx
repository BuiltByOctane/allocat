"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

/**
 * Publishes the soft-keyboard height to the `--keyboard-inset` CSS variable on
 * <html>. Bottom sheets read it (see `.sheet-3q` and DrawerContent) to stay
 * above the keyboard and to keep a stable 3/4 height across keyboard open/close.
 *
 *  - Native (Android/iOS): Capacitor Keyboard `keyboardWillShow/Hide` give the
 *    exact keyboard height. With `resize:"none"` (capacitor.config.ts) the
 *    WebView never resizes, so dvh stays full-screen and we drive the inset
 *    entirely from these events.
 *  - Web/PWA: `window.visualViewport` reports the region the keyboard occludes.
 *
 * Renders nothing.
 */
export function KeyboardInset() {
  useEffect(() => {
    const root = document.documentElement;
    const set = (px: number) =>
      root.style.setProperty("--keyboard-inset", `${Math.max(0, Math.round(px))}px`);
    const reset = () => set(0);

    // --- Native: Capacitor Keyboard plugin ---
    if (Capacitor.isNativePlatform()) {
      let showH: PluginListenerHandle | undefined;
      let hideH: PluginListenerHandle | undefined;
      let cancelled = false;

      (async () => {
        const { Keyboard } = await import("@capacitor/keyboard");
        if (cancelled) return;
        showH = await Keyboard.addListener("keyboardWillShow", (info) =>
          set(info.keyboardHeight)
        );
        hideH = await Keyboard.addListener("keyboardWillHide", reset);
      })();

      return () => {
        cancelled = true;
        void showH?.remove();
        void hideH?.remove();
        reset();
      };
    }

    // --- Web/PWA: visualViewport ---
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // Height the keyboard (or other UI) hides at the bottom of the layout
      // viewport. Clamp tiny values to 0 to avoid jitter from rounding.
      const occluded = window.innerHeight - vv.height - vv.offsetTop;
      set(occluded > 60 ? occluded : 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      reset();
    };
  }, []);

  return null;
}
