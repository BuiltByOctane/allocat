"use client";

import { useEffect } from "react";

export default function RegisterPWA() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    (async () => {
      try {
        const { Serwist } = await import("@serwist/window");
        if (cancelled) return;
        const serwist = new Serwist("/sw.js", { scope: "/", type: "classic" });
        await serwist.register();
      } catch (err) {
        console.error("[PWA] service worker registration failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
