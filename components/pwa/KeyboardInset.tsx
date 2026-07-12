"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

/**
 * Keeps bottom sheets stable across soft-keyboard open/close, WITHOUT trying to
 * measure the keyboard and resize the sheet (every version of that fought the
 * native WebView and lost). The strategy now:
 *
 *  1. `--app-vh`: a STABLE full-screen height in px, captured ONCE on mount
 *     (before any keyboard) and refreshed ONLY on real orientation changes —
 *     never on a plain `resize`. This is the crucial fix: a soft keyboard fires
 *     `resize` (and on some devices resizes the window), and the old code
 *     refreshed `--app-vh` on `resize`, so the keyboard shrank the sheet and it
 *     stayed shrunk. Ignoring `resize` means the keyboard can never change the
 *     sheet height. `.sheet-3q` uses `--app-vh` for a fixed full-screen height.
 *
 *  2. `--keyboard-inset`: current keyboard height in px (0 when closed). No
 *     longer used to resize/lift the sheet — only as bottom scroll padding so a
 *     field near the bottom has room to scroll above the keyboard.
 *
 *  3. Focus auto-scroll: when an input is focused, after the keyboard animates
 *     we scroll it to the middle of its scroll container so it's always visible
 *     above the keyboard. This replaces all the height math and works the same
 *     on native and web — no native rebuild required.
 *
 * Renders nothing.
 */
export function KeyboardInset() {
  useEffect(() => {
    const root = document.documentElement;
    const setInset = (px: number) =>
      root.style.setProperty("--keyboard-inset", `${Math.max(0, Math.round(px))}px`);
    const setAppVh = (px: number) =>
      root.style.setProperty("--app-vh", `${Math.max(0, Math.round(px))}px`);

    // Stable full-screen height. Captured now — the app opens with no keyboard,
    // so window.innerHeight is the true full WebView height. We deliberately do
    // NOT refresh it on `resize` (that's the keyboard), only on real rotation, so
    // the keyboard can never shrink the sheet.
    setAppVh(window.innerHeight);
    const onOrientation = () => setAppVh(window.innerHeight);
    window.addEventListener("orientationchange", onOrientation);

    // Focus auto-scroll: bring the focused field above the keyboard.
    const FIELD = 'input, textarea, select, [contenteditable="true"]';
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !t.matches(FIELD)) return;
      // Skip fixed bottom sheets (`.sheet-3q`, e.g. the emoji picker): they're
      // already lifted above the keyboard by `--keyboard-inset`, so centering an
      // input inside them scrolls the whole modal far off-screen to the top.
      if (t.closest(".sheet-3q")) return;
      // Wait for the keyboard to finish animating, then center the field in its
      // scroll container so it sits comfortably above the keyboard.
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        t.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 320);
    };
    document.addEventListener("focusin", onFocusIn);

    const cleanupCommon = () => {
      window.removeEventListener("orientationchange", onOrientation);
      document.removeEventListener("focusin", onFocusIn);
      if (scrollTimer) clearTimeout(scrollTimer);
    };

    // --- Native: Capacitor Keyboard plugin drives --keyboard-inset ---
    if (Capacitor.isNativePlatform()) {
      let showH: PluginListenerHandle | undefined;
      let hideH: PluginListenerHandle | undefined;
      let cancelled = false;

      (async () => {
        const { Keyboard } = await import("@capacitor/keyboard");
        if (cancelled) return;
        showH = await Keyboard.addListener("keyboardWillShow", (info) =>
          setInset(info.keyboardHeight),
        );
        hideH = await Keyboard.addListener("keyboardWillHide", () => setInset(0));
      })();

      return () => {
        cancelled = true;
        cleanupCommon();
        void showH?.remove();
        void hideH?.remove();
        setInset(0);
      };
    }

    // --- Web/PWA: visualViewport drives --keyboard-inset ---
    const vv = window.visualViewport;
    if (!vv) {
      return () => {
        cleanupCommon();
        setInset(0);
      };
    }
    const update = () => {
      const occluded = window.innerHeight - vv.height - vv.offsetTop;
      setInset(occluded > 60 ? occluded : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cleanupCommon();
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setInset(0);
    };
  }, []);

  return null;
}
