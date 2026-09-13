"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

/**
 * Publishes two CSS variables that bottom sheets position themselves against.
 *
 *  1. `--app-vh` — the full-screen height in px. Written ONLY while nothing is
 *     covering the viewport, so a WebView that shrinks when the keyboard opens
 *     can never latch a shrunken value here. `.sheet-3q` uses it for its
 *     constant top line (the top of the screen doesn't move when a keyboard
 *     opens), never for a height.
 *
 *  2. `--keyboard-inset` — the RESIDUAL keyboard occlusion: how much of the
 *     *live* layout viewport the keyboard still covers, after whatever the
 *     native layer has already taken away.
 *
 * That second word is the whole point. The app used to publish the IME height
 * reported by @capacitor/keyboard and assume the WebView stayed full-screen
 * (`Keyboard.resize: "none"` + `windowSoftInputMode="adjustNothing"`). That
 * assumption is no longer true: since Capacitor 8 the Keyboard plugin skips its
 * own resizing whenever the SystemBars plugin is loaded, and SystemBars pads the
 * WebView's parent by the IME inset on Android 15+ — and on ANY Android version
 * once the device's WebView is >= 140 and the page sets `viewport-fit=cover`
 * (we do). On those devices the viewport is already sitting above the keyboard,
 * so lifting the sheet by the IME height again moved it a full keyboard clear of
 * the keyboard and ran its top edge off the screen. Devices on older WebViews
 * still get no native resize — which is exactly why this only ever reproduced on
 * "some devices".
 *
 * So: measure, don't assume.
 *
 *     nativeShrink = appVh - window.innerHeight     // what the native layer took
 *     residual     = max(imeHeight - nativeShrink, visualViewportOcclusion, 0)
 *
 * Native resize present  → nativeShrink ≈ imeHeight → residual ≈ 0, no lift.
 * No native resize       → nativeShrink = 0         → residual = imeHeight.
 * Web / PWA (no plugin)  → imeHeight = 0            → visualViewport carries it.
 *
 * One code path, no device sniffing, and it self-corrects if the native side
 * changes behaviour again under us.
 *
 * Renders nothing.
 */
export function KeyboardInset() {
  useEffect(() => {
    const root = document.documentElement;

    // Last IME height reported by the native plugin, in CSS px. Always 0 on web.
    let imeHeight = 0;
    // Stable full-screen height. Seeded now — the app opens with no keyboard, so
    // window.innerHeight is the true full height — then only ever refreshed by
    // recompute() while nothing occludes the viewport.
    let appVh = window.innerHeight;

    const setInset = (px: number) =>
      root.style.setProperty("--keyboard-inset", `${Math.max(0, Math.round(px))}px`);
    const setAppVh = (px: number) => {
      appVh = Math.max(0, Math.round(px));
      root.style.setProperty("--app-vh", `${appVh}px`);
    };

    setAppVh(window.innerHeight);
    setInset(0);

    const recompute = () => {
      const vv = window.visualViewport;
      // What the keyboard covers of the live layout viewport. Chromium >= M139
      // shrinks the visual viewport for the IME directly; older engines leave
      // this at 0 and the native imeHeight below is the only signal.
      const vvOccluded = vv
        ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        : 0;
      // What the native layer already removed by shrinking the WebView itself.
      const nativeShrink = Math.max(0, appVh - window.innerHeight);

      const residual = Math.max(0, imeHeight - nativeShrink, vvOccluded);

      // Re-seed --app-vh only when nothing is covering the viewport AND the
      // window is TALLER than what we recorded. Grow-only is the safety catch:
      // a plain `resize` can land before the plugin has reported the IME height,
      // and on a device where the native layer shrinks the WebView both viewport
      // measurements agree at that instant, so an unguarded re-seed would record
      // the keyboard as the full screen and stay stuck there — the exact failure
      // the previous revisions kept chasing. A keyboard can only ever shrink the
      // window, so growth is always genuine (mount under an open keyboard, split
      // screen, a stale rotation read). Real shrinks come from onOrientation.
      if (
        residual === 0 &&
        imeHeight === 0 &&
        vvOccluded === 0 &&
        window.innerHeight > appVh
      ) {
        setAppVh(window.innerHeight);
      }

      setInset(residual);
    };

    // A rotation is the only thing allowed to SHRINK --app-vh, so it replaces it
    // outright. `orientationchange` can fire before the new layout is in, hence
    // the settle pass.
    let orientTimer: ReturnType<typeof setTimeout> | undefined;
    const onOrientation = () => {
      imeHeight = 0;
      setAppVh(window.innerHeight);
      recompute();
      if (orientTimer) clearTimeout(orientTimer);
      orientTimer = setTimeout(() => {
        setAppVh(window.innerHeight);
        recompute();
      }, 300);
    };
    window.addEventListener("orientationchange", onOrientation);
    window.addEventListener("resize", recompute);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", recompute);
    vv?.addEventListener("scroll", recompute);

    // Focus auto-scroll: bring the focused field above the keyboard.
    const FIELD = 'input, textarea, select, [contenteditable="true"]';
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !t.matches(FIELD)) return;
      // Skip fixed bottom sheets (`.sheet-3q`, e.g. the emoji picker): they're
      // already sized to the space above the keyboard, so centering an input
      // inside them scrolls the whole modal off-screen.
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
      window.removeEventListener("resize", recompute);
      vv?.removeEventListener("resize", recompute);
      vv?.removeEventListener("scroll", recompute);
      document.removeEventListener("focusin", onFocusIn);
      if (scrollTimer) clearTimeout(scrollTimer);
      if (orientTimer) clearTimeout(orientTimer);
      setInset(0);
    };

    if (!Capacitor.isNativePlatform()) {
      recompute();
      return cleanupCommon;
    }

    // --- Native: the Capacitor Keyboard plugin supplies the IME height ---
    // It fires at the START of the show animation, before the native resize has
    // laid out, so `nativeShrink` would still read 0 at that instant. Recompute
    // again once the animation has ended (keyboardDidShow) and on every viewport
    // event in between, so the residual settles at the right value either way.
    let showH: PluginListenerHandle | undefined;
    let didShowH: PluginListenerHandle | undefined;
    let hideH: PluginListenerHandle | undefined;
    let cancelled = false;

    (async () => {
      const { Keyboard } = await import("@capacitor/keyboard");
      if (cancelled) return;
      const onShow = (info: { keyboardHeight: number }) => {
        imeHeight = info.keyboardHeight;
        // Deferred a frame on purpose: `keyboardWillShow` fires as the IME
        // animation starts, and on a device whose native layer shrinks the
        // WebView that shrink has not been laid out yet — reading innerHeight
        // right now would report nativeShrink 0 and lift the sheet by a full
        // keyboard before the correction lands. One frame later both readings
        // agree. The `resize`/visualViewport listeners and keyboardDidShow
        // settle it regardless.
        requestAnimationFrame(recompute);
      };
      showH = await Keyboard.addListener("keyboardWillShow", onShow);
      didShowH = await Keyboard.addListener("keyboardDidShow", onShow);
      hideH = await Keyboard.addListener("keyboardWillHide", () => {
        imeHeight = 0;
        recompute();
      });
    })();

    return () => {
      cancelled = true;
      cleanupCommon();
      void showH?.remove();
      void didShowH?.remove();
      void hideH?.remove();
    };
  }, []);

  return null;
}
