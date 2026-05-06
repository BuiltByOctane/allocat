"use client";

import { useEffect, useState } from "react";

export const dynamic = "force-static";

export default function OfflinePage() {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const onOnline = () => {
      window.location.reload();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const handleRetry = () => {
    setRetrying(true);
    window.location.reload();
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background text-foreground px-6">
      <div className="max-w-sm w-full flex flex-col items-center text-center gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/paw.png"
          alt="AlloCat"
          width={72}
          height={72}
          className="opacity-90"
        />
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-semibold">You&apos;re offline</h1>
          <p className="text-sm text-foreground/60 leading-relaxed">
            AlloCat works offline once your data is loaded. This page wasn&apos;t cached
            yet — try opening it again when you&apos;re back online, or head to a page
            you&apos;ve already visited.
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="w-full h-11 rounded-lg bg-foreground text-background font-medium text-sm disabled:opacity-50 transition-opacity"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
          <button
            onClick={() => (window.location.href = "/dashboard")}
            className="w-full h-11 rounded-lg border border-foreground/15 text-sm font-medium hover:bg-foreground/5 transition-colors"
          >
            Go to dashboard
          </button>
        </div>
        <p className="text-xs text-foreground/40 mt-2">
          Your changes are saved locally and will sync automatically.
        </p>
      </div>
    </div>
  );
}
