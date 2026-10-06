"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { useQueryClient } from "@tanstack/react-query";
import { useEnqueue } from "@/lib/hooks/useSync";
import { invalidateSmsCaches } from "@/lib/hooks/useSmsTransactions";
import { reapplyRulesToPending } from "@/lib/sms/ingestClient";
import { refreshTables } from "@/lib/db/hydrate";
import { useSyncContext } from "@/lib/providers/SyncProvider";
import { useAppFlags } from "@/lib/hooks/useAppFlags";

/**
 * localStorage marker: this account set up iPhone SMS capture on this device.
 * Set by the setup card; account-scoped (cleared on sign-out). Keeps the extra
 * foreground pull below off for everyone who never uses the shortcut.
 */
export const IOS_SHORTCUT_LS_KEY = "allocat-ios-shortcut";

/** One sms_transactions delta pull at most this often. */
const MIN_INTERVAL_MS = 30_000;

function shortcutEnabled(): boolean {
  try {
    return window.localStorage.getItem(IOS_SHORTCUT_LS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Web/PWA twin of the native SmsBridge's open-time drain, for the iPhone
 * shortcut path.
 *
 * Shortcut captures land on the server as PENDING rows (the shortcut request
 * has no cookie session, so it cannot run the spend cascade). When the app
 * opens or returns to the foreground this pulls them into IDB and runs
 * `reapplyRulesToPending`, which allocates every row matching a learned
 * merchant rule and enqueues the CATEGORIZE — the same outcome Android gets for
 * SMS that arrived while the app was closed.
 *
 * The SyncProvider's own foreground refresh is skipped within 5 minutes of the
 * last reconcile, so a spend made just after closing the app would otherwise
 * not appear until later; this pulls the one table directly.
 */
function ShortcutReconciler() {
  const enqueue = useEnqueue();
  const qc = useQueryClient();
  const { isHydrated } = useSyncContext();

  const enqueueRef = useRef(enqueue);
  const qcRef = useRef(qc);
  useEffect(() => {
    enqueueRef.current = enqueue;
    qcRef.current = qc;
  });

  useEffect(() => {
    if (Capacitor.isNativePlatform() || !isHydrated) return;

    let running = false;
    let lastRun = 0;

    const run = async () => {
      if (running || !shortcutEnabled()) return;
      if (Date.now() - lastRun < MIN_INTERVAL_MS) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      running = true;
      lastRun = Date.now();
      try {
        await refreshTables(["sms_transactions"]);
        await reapplyRulesToPending({ enqueue: enqueueRef.current });
        invalidateSmsCaches(qcRef.current);
      } catch (err) {
        console.warn("[ShortcutReconciler] reconcile failed:", err);
      } finally {
        running = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };

    void run();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isHydrated]);

  return null;
}

/** Mounted beside SmsBridgeGate; honours the same `sms_enabled` kill switch. */
export function ShortcutReconcilerGate() {
  const { sms_enabled } = useAppFlags();
  if (!sms_enabled) return null;
  return <ShortcutReconciler />;
}
