"use client";

import { useEffect, useState } from "react";
import { usePWAInstall } from "@/lib/hooks/usePWAInstall";
import { useHaptic } from "@/lib/hooks/useHaptic";

function playChime() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const notes = [
      { f: 1046.5, t: 0 },
      { f: 1396.91, t: 0.07 },
      { f: 2093.0, t: 0.14 },
    ];
    const master = ctx.createGain();
    master.gain.value = 0.12;
    master.connect(ctx.destination);
    notes.forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, now + t);
      const start = now + t;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(1, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(master);
      osc.start(start);
      osc.stop(start + 0.36);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {}
}

export function InstallPrompt() {
  const { canInstall, isIOS, prompt, dismiss } = usePWAInstall();
  const haptic = useHaptic();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!canInstall) return;
    const t = setTimeout(() => {
      setVisible(true);
      playChime();
    }, 800);
    return () => clearTimeout(t);
  }, [canInstall]);

  if (!canInstall) return null;

  const handleInstall = async () => {
    haptic.medium();
    await prompt();
  };

  const handleDismiss = () => {
    haptic.light();
    setVisible(false);
    setTimeout(dismiss, 300);
  };

  return (
    <div
      className={`fixed bottom-[88px] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[448px] md:left-auto md:right-6 md:bottom-6 md:translate-x-0 md:max-w-sm z-40 transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      <div className="bg-card border border-border rounded-2xl p-4 shadow-xl flex items-center gap-3">
        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: "20px" }}>
            install_mobile
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">Install AlloCat</p>
          {isIOS ? (
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Tap{" "}
              <span
                className="material-symbols-outlined align-middle"
                style={{ fontSize: "13px" }}
              >
                ios_share
              </span>{" "}
              then "Add to Home Screen"
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">Get the full app experience</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isIOS && (
            <button
              onClick={handleInstall}
              className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg active:scale-95 transition-transform"
            >
              Install
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="size-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              close
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
