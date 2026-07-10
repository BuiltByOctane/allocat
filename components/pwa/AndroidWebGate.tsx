"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.octane.allocat";

/**
 * Hard gate for AlloCat on the **web** when running in an **Android browser**.
 *
 * The native Android app is a Capacitor wrapper of this same web app, so we must
 * NOT gate when running inside it — `Capacitor.isNativePlatform()` guards that.
 * iOS users (PWA) and desktop are never gated; only Android browsers see this.
 */
export function AndroidWebGate() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return; // inside the native app — allow
    const isAndroid = /android/i.test(navigator.userAgent);
    if (isAndroid) setBlocked(true);
  }, []);

  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-md px-6 text-center">
      <div className="flex w-full max-w-sm flex-col items-center">
        <img
          src="/allocat-logo.png"
          alt="AlloCat"
          className="mb-6 size-20 rounded-2xl"
        />
        <h1 className="text-2xl font-bold text-foreground leading-tight">
          AlloCat works best in the app
        </h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          On Android, AlloCat runs as a dedicated app - faster, offline-ready, with
          SMS auto-tracking and notifications. Install it from the Play Store to
          continue.
        </p>

        <a
          href={PLAY_STORE_URL}
          className="mt-8 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-pill bg-accent px-6 text-[15px] font-bold text-[var(--accent-ink)] transition-all hover:brightness-[0.97] active:scale-[0.98]"
        >
          <PlayIcon className="size-5" />
          Get it on Google Play
        </a>

        <p className="mt-4 text-xs text-muted-foreground">
          On iPhone or desktop? AlloCat runs right here in your browser.
        </p>
      </div>
    </div>
  );
}

/** Google Play badge-style mark. */
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} fill="currentColor" aria-hidden>
      <path d="M325.3 234.3 104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l220.7-221.3 60.1 60.1L104.6 499z" />
    </svg>
  );
}
