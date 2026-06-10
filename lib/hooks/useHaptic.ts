"use client";

/**
 * useHaptic — haptic feedback.
 *
 * On native (Capacitor) uses @capacitor/haptics (the WebView lacks VIBRATE so
 * navigator.vibrate is a no-op there). On the web falls back to the Vibration
 * API. Durations are short to feel native and non-intrusive.
 */
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

export type HapticStyle =
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "error"
  | "selection";

const PATTERNS: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 35,
  success: [15, 60, 15],
  error: [20, 40, 20, 40, 20],
  selection: 8,
};

function nativeHaptic(style: HapticStyle) {
  switch (style) {
    case "light":
    case "selection":
      void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      break;
    case "medium":
      void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      break;
    case "heavy":
      void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
      break;
    case "success":
      void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      break;
    case "error":
      void Haptics.notification({ type: NotificationType.Error }).catch(() => {});
      break;
  }
}

function play(style: HapticStyle) {
  if (Capacitor.isNativePlatform()) {
    nativeHaptic(style);
    return;
  }
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(PATTERNS[style]);
  } catch {
    // some browsers throw on vibrate
  }
}

// Continuous selection feedback (iOS UISelectionFeedbackGenerator / Android
// tick) — purpose-built for sliders & pickers. Call `selectionStart` once when
// the gesture begins, `selectionChanged` on each step, `selectionEnd` on release.
function nativeSelection(phase: "start" | "changed" | "end") {
  if (Capacitor.isNativePlatform()) {
    if (phase === "start") void Haptics.selectionStart().catch(() => {});
    else if (phase === "changed") void Haptics.selectionChanged().catch(() => {});
    else void Haptics.selectionEnd().catch(() => {});
    return;
  }
  // Web fallback: a crisp tick on each step (start/end are silent).
  if (phase === "changed") play("selection");
}

export function useHaptic() {
  return {
    /** Trigger haptic feedback (default: "light"). */
    trigger(style: HapticStyle = "light") {
      play(style);
    },
    light: () => play("light"),
    medium: () => play("medium"),
    heavy: () => play("heavy"),
    success: () => play("success"),
    error: () => play("error"),
    selection: () => play("selection"),
    /** Begin a continuous selection gesture (slider/picker). */
    selectionStart: () => nativeSelection("start"),
    /** One selection step — fire on each item crossed. */
    selectionChanged: () => nativeSelection("changed"),
    /** End the selection gesture. */
    selectionEnd: () => nativeSelection("end"),
  };
}
