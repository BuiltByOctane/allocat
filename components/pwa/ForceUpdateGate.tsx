"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.octane.allocat";

const DEFAULT_MESSAGE =
  "A new version of AlloCat is required to continue. Update from the Play Store to keep tracking your finances.";

/**
 * Hard force-update gate for the **native Android app**.
 *
 * The native shell is a remote-URL WebView of this same web app, so the web
 * layer can enforce a minimum version: it reads the native `versionCode`
 * (`App.getInfo().build`) and compares it to a server-controlled minimum from
 * `/api/app-config`. If the installed build is too old, it renders a
 * full-screen, non-dismissible block that deep-links to the Play Store.
 *
 * Web browsers are never gated here (they get `AndroidWebGate` instead).
 * Fail-open: if the version or config can't be read, the app stays usable.
 */
export function ForceUpdateGate() {
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return; // web is handled elsewhere

    let cancelled = false;
    (async () => {
      try {
        const [{ build }, res] = await Promise.all([
          App.getInfo(),
          fetch("/api/app-config", { cache: "no-store" }),
        ]);
        if (cancelled || !res.ok) return;
        const cfg = (await res.json()) as {
          minAndroidVersionCode?: number;
          updateMessage?: string | null;
        };
        const min = Number(cfg.minAndroidVersionCode ?? 0);
        const current = Number(build);
        if (Number.isFinite(current) && Number.isFinite(min) && current < min) {
          if (cfg.updateMessage) setMessage(cfg.updateMessage);
          setBlocked(true);
        }
      } catch {
        // fail-open — never lock the user out on a fetch/parse error
      }
    })();

    return () => {
      cancelled = true;
    };
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
          Update required
        </h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          {message}
        </p>

        <a
          href={PLAY_STORE_URL}
          className="mt-8 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-pill bg-accent px-6 text-[15px] font-bold text-[var(--accent-ink)] transition-all hover:brightness-[0.97] active:scale-[0.98]"
        >
          <PlayIcon className="size-5" />
          Update on Google Play
        </a>
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
