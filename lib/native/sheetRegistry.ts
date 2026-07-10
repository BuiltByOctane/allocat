"use client";

import { useEffect } from "react";

/**
 * A LIFO stack of close handlers for hand-rolled modal/sheet portals (e.g.
 * `EmojiPickerModal`) that are NOT vaul/Radix dialogs. The Android hardware back
 * button should close the topmost open sheet instead of navigating the page.
 *
 * vaul/Radix dialogs are handled separately in `NativeShell` (they close on a
 * synthetic Escape via Radix's DismissableLayer). This registry only covers
 * custom portals that don't participate in that mechanism, and is checked FIRST
 * so a picker layered on top of a vaul sheet closes before the sheet does.
 */
type CloseFn = () => void;

const stack: CloseFn[] = [];

/** Push a close handler; returns an unregister fn (call on close/unmount). */
export function pushSheet(close: CloseFn): () => void {
  stack.push(close);
  return () => {
    const i = stack.lastIndexOf(close);
    if (i !== -1) stack.splice(i, 1);
  };
}

/** Close (and pop) the most-recently-opened registered sheet. */
export function closeTopSheet(): boolean {
  const close = stack.pop();
  if (!close) return false;
  try {
    close();
  } catch {
    /* best effort */
  }
  return true;
}

/**
 * Register `close` on the back-button stack while `isOpen` is true. Drop a call
 * to this inside any custom (non-vaul) modal so the hardware back button closes
 * it instead of navigating.
 */
export function useSheetBackClose(isOpen: boolean, close: CloseFn): void {
  useEffect(() => {
    if (!isOpen) return;
    return pushSheet(close);
  }, [isOpen, close]);
}
