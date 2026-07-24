"use client";

import { useEffect } from "react";

/**
 * Locks the document scroll (and disables the bottom dock) while ANY vaul
 * bottom sheet is open.
 *
 * Why this exists: vaul's own body scroll-lock is gated behind `if (!isSafari())
 * return` — it only pins the body on iOS Safari. In the Android WebView shell
 * (Chromium) and on desktop Chrome the background document stays scrollable, so
 * dragging/scrolling in the dimmed area above a sheet moved the page and the
 * fixed nav behind it. We watch for any open drawer (`[data-vaul-drawer-
 * visible="true"]`, set by vaul) and freeze `<html>` overflow — no position:fixed,
 * so there is no scroll jump and fixed elements don't shift. A `data-sheet-open`
 * flag on `<html>` lets globals.css hide the bottom dock so its buttons (which
 * can out-stack a lower-z overlay) can't be tapped through.
 */
export function SheetScrollLock() {
  useEffect(() => {
    const root = document.documentElement;
    let locked = false;

    const sync = () => {
      const open = document.querySelector(
        '[data-vaul-drawer][data-vaul-drawer-visible="true"]',
      );
      if (open && !locked) {
        locked = true;
        root.style.overflow = "hidden";
        root.dataset.sheetOpen = "1";
      } else if (!open && locked) {
        locked = false;
        root.style.overflow = "";
        delete root.dataset.sheetOpen;
      }
    };

    const mo = new MutationObserver(sync);
    mo.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-vaul-drawer-visible"],
    });
    sync();

    return () => {
      mo.disconnect();
      root.style.overflow = "";
      delete root.dataset.sheetOpen;
    };
  }, []);

  return null;
}
