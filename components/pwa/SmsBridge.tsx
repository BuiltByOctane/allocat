"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { useQueryClient } from "@tanstack/react-query";
import { SmsReader, type CapturedSms } from "@/lib/native/SmsReader";
import { useEnqueue } from "@/lib/hooks/useSync";
import { invalidateSmsCaches } from "@/lib/hooks/useSmsTransactions";
import { ingestSmsClient, reapplyRulesToPending } from "@/lib/sms/ingestClient";
import { scheduleWeeklyRecap } from "@/lib/sms/recap";
import { scheduleDebtReminders } from "@/lib/native/debtReminders";
import { pushSmsMirrorToNative } from "@/lib/sms/nativeMirror";
import { getDB } from "@/lib/db";
import { useSyncContext } from "@/lib/providers/SyncProvider";

/**
 * Native-only bridge between the SMS plugin and the web ingest pipeline.
 *
 * - App OPEN: receives live "smsReceived" events → ingest (which notifies).
 * - App CLOSED: the native receiver parses + notifies itself; the raw SMS is
 *   queued. On next open we drain the queue SILENTLY (native already notified)
 *   so the spend is logged/synced without a duplicate notification.
 * - Pushes merchant rules to native so closed-app notifications can name the
 *   matched category, and consumes the deep-link from a tapped notification.
 *
 * The queue drain is gated on `isHydrated`: draining before merchant_rules are
 * pulled into IDB would mark known-merchant spends `pending` (matchMerchantRule
 * sees an empty table), flickering them in /sms until the server reconciles.
 */
export function SmsBridge() {
  const enqueue = useEnqueue();
  const enqueueRef = useRef(enqueue);
  useEffect(() => {
    enqueueRef.current = enqueue;
  });

  // Mirror the query client so the once-registered native handlers can refresh
  // the SMS views after ingesting a row (an open /sms reads React Query, not IDB
  // directly — without this a notification-drained txn never appears until a
  // remount re-reads IDB).
  const qc = useQueryClient();
  const qcRef = useRef(qc);
  useEffect(() => {
    qcRef.current = qc;
  });

  // Mirror hydration into a ref so the once-registered visibilitychange handler
  // can read the latest value without re-subscribing.
  const { isHydrated } = useSyncContext();
  const hydratedRef = useRef(isHydrated);
  useEffect(() => {
    hydratedRef.current = isHydrated;
  }, [isHydrated]);

  // Closures owned by the setup effect, exposed so the hydration-gated effect can
  // trigger the first drain without tearing down the native listeners.
  const drainRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const consumeDeepLinkRef = useRef<(() => Promise<void>) | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let smsListener: PluginListenerHandle | undefined;
    let notifTap: PluginListenerHandle | undefined;
    // Serialize drains so the initial drain and a visibilitychange drain can't
    // overlap (which would double-ingest the same queued SMS).
    let draining = false;
    // The last deep-link we navigated to — so re-checking on visibilitychange
    // doesn't re-assign the same URL mid-interaction.
    let lastConsumedUrl: string | null = null;
    // Signature of the last blocklist payload pushed to native, so a
    // foreground that didn't change anything skips the native IPC entirely.
    // (Rules/targets/config have their own guard inside pushSmsMirrorToNative.)
    let lastBlocklistSig: string | null = null;
    // Debounce the foreground burst: a quick minimize/restore shouldn't restart
    // the whole drain + mirror storm. 0 means "never run yet".
    let lastForegroundRun = 0;

    // Run non-critical work off the foreground paint path so resuming the app
    // doesn't freeze the UI thread. Falls back to a macrotask where idle
    // callbacks are unavailable (older Android WebViews).
    const runIdle = (fn: () => void) => {
      const ric = (
        window as unknown as {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
        }
      ).requestIdleCallback;
      if (ric) ric(fn, { timeout: 2000 });
      else setTimeout(fn, 200);
    };

    const handle = async (m: CapturedSms, silent: boolean) => {
      try {
        await ingestSmsClient(
          { raw: m.body, sender: m.sender, receivedAt: m.ts },
          { enqueue: enqueueRef.current },
          { silent },
        );
        // Live event: refresh the SMS views immediately so an open /sms reflects
        // the new row. Drained batches invalidate once at the end of drain().
        if (!silent) qcRef.current.invalidateQueries({ queryKey: ["sms-transactions"] });
      } catch (err) {
        console.warn("[SmsBridge] ingest failed:", err);
      }
    };

    // Queued SMS were captured while closed — native already notified, so silent.
    // Gated on hydration (rules must be in IDB first) and serialized.
    const drain = async () => {
      if (draining || !hydratedRef.current) return;
      draining = true;
      try {
        const { messages } = await SmsReader.getQueued();
        for (const m of messages) await handle(m, true);
        // Catch rows that were ingested as pending before rules existed.
        const { applied } = await reapplyRulesToPending({
          enqueue: enqueueRef.current,
        });
        // Refresh the SMS views once per batch so a notification-drained txn
        // shows up on an already-open /sms (the deep-link effect re-runs when
        // its `pending` query refetches and can then find the row).
        if (messages.length > 0 || applied > 0) {
          invalidateSmsCaches(qcRef.current);
        }
      } catch (err) {
        console.warn("[SmsBridge] drain failed:", err);
      } finally {
        draining = false;
      }
    };

    // Mirror the reported-template blocklist into native so the closed-app
    // receiver can skip whole "kinds" of SMS the user flagged as mistakes.
    const pushBlocklist = async () => {
      try {
        const rows = await getDB().sms_blocklist.toArray();
        const keys = rows.map((r) => r.template_key);
        const keysStr = JSON.stringify(keys);
        if (keysStr === lastBlocklistSig) return;
        lastBlocklistSig = keysStr;
        await SmsReader.setBlocklist({ keys: keysStr });
      } catch {
        /* ignore */
      }
    };

    // A tapped native notification stashes a deep-link; follow it. consumeDeepLink
    // is fired on mount AND every visibilitychange, so it must be idempotent:
    // consuming clears the native stash, but we also guard against re-assigning
    // a URL we already navigated to (or already are on) so a stray re-check can't
    // reload the page out from under an in-progress interaction.
    const consumeDeepLink = async () => {
      try {
        const { url } = await SmsReader.consumeDeepLink();
        if (!url) return;
        if (url === lastConsumedUrl) return;
        const here = window.location.pathname + window.location.search;
        if (here === url || here.startsWith(url)) {
          lastConsumedUrl = url;
          return;
        }
        lastConsumedUrl = url;
        window.location.assign(url);
      } catch {
        /* ignore */
      }
    };

    // Expose drain + deep-link so the hydration-gated effect can run the FIRST
    // drain the moment rules land (without re-registering the native listeners).
    drainRef.current = drain;
    consumeDeepLinkRef.current = consumeDeepLink;

    (async () => {
      // NOTE: the bridge deliberately does NOT request the SMS permission here.
      // Google Play's prominent-disclosure policy requires the OS prompt to fire
      // ONLY after the user reads the disclosure and taps Allow — that flow lives
      // in NativeSetup.tsx (the sole requester). If permission isn't granted yet,
      // the listeners below simply never fire and drain() returns nothing.
      // Capacitor local-notification taps (the in-app notifyLocal ones).
      try {
        const { LocalNotifications } = await import(
          "@capacitor/local-notifications"
        );
        notifTap = await LocalNotifications.addListener(
          "localNotificationActionPerformed",
          (e) => {
            const url = e.notification?.extra?.url;
            if (typeof url === "string") window.location.assign(url);
          },
        );
      } catch {
        /* plugin unavailable */
      }
      try {
        // Live events only fire while the app is open (already hydrated), so the
        // handler stays active regardless of the hydration gate on drain().
        smsListener = await SmsReader.addListener("smsReceived", (m) => {
          void handle(m, false);
        });
      } catch {
        /* plugin unavailable */
      }
      // drain() self-gates on hydration; the [isHydrated] effect below also kicks
      // the initial drain when rules finish loading after this IIFE runs.
      await drain();
      await consumeDeepLink();
      // Mirroring rules/blocklist and scheduling recaps is non-critical for the
      // first paint — defer it off the launch path so the UI (and the first-run
      // setup/tour modals) stay responsive instead of starving on IDB reads.
      lastForegroundRun = Date.now();
      runIdle(() => {
        // Mirror merchant rules + quick-allocate targets + config into native
        // so closed-app notifications can label the matched category. Shared
        // with useSmsTransactions.ts / BudgetSetupSheet — see
        // lib/sms/nativeMirror.ts for the builder + its own signature guard.
        void pushSmsMirrorToNative();
        void pushBlocklist();
        void scheduleWeeklyRecap();
        void scheduleDebtReminders();
      });
    })();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // Critical for responsiveness: follow a tapped-notification deep link and
      // ingest anything queued while we were away. Both are cheap + serialized.
      void consumeDeepLink();
      void drain();

      // Debounce the heavy mirror/schedule burst — a quick minimize/restore must
      // not restart it — and run it off the foreground paint path.
      const nowTs = Date.now();
      if (nowTs - lastForegroundRun < 2000) return;
      lastForegroundRun = nowTs;
      runIdle(() => {
        // Mirror merchant rules + quick-allocate targets + config into native
        // so closed-app notifications can label the matched category. Shared
        // with useSmsTransactions.ts / BudgetSetupSheet — see
        // lib/sms/nativeMirror.ts for the builder + its own signature guard.
        void pushSmsMirrorToNative();
        void pushBlocklist();
        void scheduleWeeklyRecap();
        void scheduleDebtReminders();
      });
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      drainRef.current = undefined;
      consumeDeepLinkRef.current = undefined;
      void smsListener?.remove();
      void notifTap?.remove();
    };
  }, []);

  // Once hydration finishes (merchant_rules now in IDB), run the initial drain
  // so any SMS queued while closed are ingested/auto-sorted with rules present.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isHydrated) return;
    void drainRef.current?.();
    void consumeDeepLinkRef.current?.();
  }, [isHydrated]);

  return null;
}
