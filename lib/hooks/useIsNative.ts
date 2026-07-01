"use client";

import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * SSR-safe Capacitor-native flag. Resolves to `false` during SSR / first paint
 * (so it never causes a hydration mismatch), then to the real platform on the
 * client. Mirrors the inline recipe in AuthShell.tsx.
 */
export function useIsNative() {
  return useSyncExternalStore(
    () => () => {},
    () => Capacitor.isNativePlatform(),
    () => false,
  );
}
