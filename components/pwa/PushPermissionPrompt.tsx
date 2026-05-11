"use client";

import { useEffect, useState } from "react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { subscribePush } from "@/lib/actions/push";
import { urlBase64ToUint8Array } from "@/lib/utils/urlBase64";

const SESSION_KEY = "push-prompt-sessions";
const DISMISS_KEY = "push-prompt-dismissed";
const MIN_SESSIONS = 2;
const DISMISS_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

function bumpSessionCount(): number {
  const raw = localStorage.getItem(SESSION_KEY);
  const n = raw ? parseInt(raw, 10) || 0 : 0;
  const next = n + 1;
  localStorage.setItem(SESSION_KEY, String(next));
  return next;
}

export function PushPermissionPrompt() {
  const haptic = useHaptic();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (!("PushManager" in window)) return;
    if (Notification.permission !== "default") return;

    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt && Date.now() - parseInt(dismissedAt, 10) < DISMISS_DURATION_MS) return;

    const sessions = bumpSessionCount();
    if (sessions < MIN_SESSIONS) return;

    const t = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(t);
  }, []);

  async function handleEnable() {
    haptic.medium();
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setVisible(false);
        return;
      }
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapid) {
        console.warn("NEXT_PUBLIC_VAPID_PUBLIC_KEY missing");
        setVisible(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
        }));

      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Subscription missing keys");
      }

      await subscribePush(
        {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        },
        navigator.userAgent,
      );
      haptic.success();
      setVisible(false);
    } catch (err) {
      console.error("[PushPermissionPrompt] enable failed:", err);
      haptic.error();
    } finally {
      setBusy(false);
    }
  }

  function handleDismiss() {
    haptic.light();
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-[88px] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[448px] md:left-auto md:right-6 md:bottom-6 md:translate-x-0 md:max-w-sm z-40 transition-all duration-300"
      style={{ opacity: 1 }}
    >
      <div className="bg-card border border-border rounded-2xl p-4 shadow-xl flex items-center gap-3">
        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <span
            className="material-symbols-outlined text-primary"
            style={{ fontSize: "20px" }}
          >
            notifications_active
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">
            Get budget alerts
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            Notify me on overruns and goal milestones.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleEnable}
            disabled={busy}
            className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg active:scale-95 transition-transform disabled:opacity-50"
          >
            {busy ? "…" : "Enable"}
          </button>
          <button
            onClick={handleDismiss}
            className="size-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Dismiss"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px" }}
            >
              close
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
