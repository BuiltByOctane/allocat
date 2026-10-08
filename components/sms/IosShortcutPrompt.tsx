"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Smartphone, X } from "lucide-react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { IOS_SETUP_HREF, useIosShortcut } from "@/lib/shortcut/useIosShortcut";

const DISMISS_KEY = "allocat-ios-shortcut-prompt-dismissed";

/**
 * Slim dashboard row inviting iPhone users to set up SMS auto-capture.
 * Hidden once a key exists on this device or the row is dismissed.
 */
export function IosShortcutPrompt() {
  const { eligible, setUp } = useIosShortcut();
  const haptic = useHaptic();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!eligible || setUp || dismissed) return null;

  const dismiss = () => {
    haptic.light();
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <div className="flex items-center gap-2.5 rounded-card border border-border bg-card px-3 py-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-accent/15 text-accent">
        <Smartphone size={15} strokeWidth={2} />
      </div>
      <p className="flex-1 min-w-0 text-[11.5px] font-semibold leading-snug text-foreground">
        Log spends from bank SMS automatically on iPhone.
      </p>
      <Link
        href={IOS_SETUP_HREF}
        onClick={() => haptic.light()}
        className="shrink-0 rounded-pill bg-accent px-3 py-1.5 text-[11px] font-bold text-accent-ink active:scale-95 transition-transform"
      >
        Set up
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground active:scale-90 transition-transform"
      >
        <X size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}
