"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

/**
 * Publishes two CSS variables on <html> that keep bottom sheets stable across
 * soft-keyboard open/close:
 *
 *  - `--keyboard-inset`: current soft-keyboard height in px (0 when closed).
 *    Sheets read it to slide up / cap their height above the keyboard.
 *  - `--app-vh`: a STABLE full-viewport height in px, immune to keyboard
 *    resize. `.sheet-3q` bases its height on this so the sheet can't shrink
 *    (and stay shrunk) if the WebView ever lets `dvh` collapse on keyboard.
 *    It is captured from the FULL window height on mount (before any keyboard)
 *    and only refreshed on genuine orientation/resize events — never baked in
 *    from a keyboard-shrunk measurement.
 *
 *  - Native (Android/iOS): Capacitor Keyboard `keyboardWillShow/Hide` give the
 *    exact keyboard height. With `resize:"none"` (capacitor.config.ts) +
 *    `windowSoftInputMode="adjustNothing"` (AndroidManifest) the WebView never
 *    resizes, so `window.innerHeight` stays full even with the keyboard up — a
 *    reliable source for `--app-vh` — and we drive the inset from these events.
 *  - Web/PWA: `window.visualViewport` reports the region the keyboard occludes;
 *    `--app-vh` tracks `window.innerHeight` but only grows (mobile URL-bar /
 *    keyboard shrink it) except on orientation change, which resets the baseline.
 *
 * Renders nothing.
 */
export function KeyboardInset() {
  useEffect(() => {
    const root = document.documentElement;
    const set = (px: number) =>
      root.style.setProperty("--keyboard-inset", `${Math.max(0, Math.round(px))}px`);
    const reset = () => set(0);
    const setAppVh = (px: number) =>
      root.style.setProperty("--app-vh", `${Math.max(0, Math.round(px))}px`);

    // --- Native: Capacitor Keyboard plugin ---
    if (Capacitor.isNativePlatform()) {
      let showH: PluginListenerHandle | undefined;
      let hideH: PluginListenerHandle | undefined;
      let cancelled = false;

      // Capture the full window height now, before any keyboard. With
      // resize:"none" + adjustNothing the window never resizes on keyboard,
      // so innerHeight stays full and refreshing it on resize/orientation is
      // safe (it can't bake in a keyboard-shrunk value).
      setAppVh(window.innerHeight);
      const onWinResize = () => setAppVh(window.innerHeight);
      window.addEventListener("resize", onWinResize);
      window.addEventListener("orientationchange", onWinResize);

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
        window.removeEventListener("resize", onWinResize);
        window.removeEventListener("orientationchange", onWinResize);
        void showH?.remove();
        void hideH?.remove();
        reset();
      };
    }

    // --- Web/PWA: visualViewport ---
    // Baseline full height. Only grow it on plain resize (a mobile URL-bar or
    // keyboard can shrink innerHeight — never let that bake into --app-vh);
    // orientation changes reset the baseline since height legitimately flips.
    let baseVh = window.innerHeight;
    setAppVh(baseVh);
    const onGrow = () => {
      if (window.innerHeight > baseVh) {
        baseVh = window.innerHeight;
        setAppVh(baseVh);
      }
    };
    const onOrientation = () => {
      baseVh = window.innerHeight;
      setAppVh(baseVh);
    };
    window.addEventListener("resize", onGrow);
    window.addEventListener("orientationchange", onOrientation);

    const vv = window.visualViewport;
    if (!vv) {
      return () => {
        window.removeEventListener("resize", onGrow);
        window.removeEventListener("orientationchange", onOrientation);
        reset();
      };
    }

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
      window.removeEventListener("resize", onGrow);
      window.removeEventListener("orientationchange", onOrientation);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      reset();
    };
  }, []);

  return null;
}
