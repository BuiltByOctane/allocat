"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { SmsReader, type CapturedSms } from "@/lib/native/SmsReader";
import { useEnqueue } from "@/lib/hooks/useSync";
import { ingestSmsClient, reapplyRulesToPending } from "@/lib/sms/ingestClient";
import { scheduleWeeklyRecap } from "@/lib/sms/recap";
import { confirmAutoAllocate, notifSound } from "@/lib/sms/notifPrefs";
import { nativeSoundKey } from "@/lib/native/notifSounds";
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

    const handle = async (m: CapturedSms, silent: boolean) => {
      try {
        await ingestSmsClient(
          { raw: m.body, sender: m.sender },
          { enqueue: enqueueRef.current },
          { silent },
        );
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
        await reapplyRulesToPending({ enqueue: enqueueRef.current });
      } catch (err) {
        console.warn("[SmsBridge] drain failed:", err);
      } finally {
        draining = false;
      }
    };

    // Mirror merchant rules into native so it can label closed-app notifications.
    const pushRules = async () => {
      try {
        const db = getDB();
        const [rules, cats, items] = await Promise.all([
          db.merchant_rules.toArray(),
          db.categories.toArray(),
          db.budget_items.toArray(),
        ]);
        const name = new Map(cats.map((c) => [c.id, c.name]));
        const alloc = new Map(cats.map((c) => [c.id, Number(c.allocated_amount)]));
        const spent = new Map<string, number>();
        const itemsById = new Map(items.map((it) => [it.id, it]));
        for (const it of items) {
          spent.set(
            it.category_id,
            (spent.get(it.category_id) ?? 0) + Number(it.actual_amount),
          );
        }
        const payload = rules.map((r) => {
          const it = itemsById.get(r.budget_item_id);
          return {
            match_type: r.match_type,
            pattern: r.pattern,
            category: name.get(r.category_id) ?? "",
            allocated: alloc.get(r.category_id) ?? 0,
            spent: spent.get(r.category_id) ?? 0,
            itemName: it?.name ?? "",
            itemPlanned: it ? Number(it.planned_amount) : 0,
            itemActual: it ? Number(it.actual_amount) : 0,
          };
        });
        await SmsReader.setRules({ rules: JSON.stringify(payload) });

        // Top budget items (most-used) for the notification quick-allocate buttons.
        const targets = [...items]
          .sort((a, b) => Number(b.actual_amount) - Number(a.actual_amount))
          .slice(0, 3)
          .map((it) => ({ id: it.id, name: it.name }));
        await SmsReader.setQuickTargets({ targets: JSON.stringify(targets) });
        await SmsReader.setConfig({
          confirmAutoAllocate: confirmAutoAllocate(),
          sound: nativeSoundKey(notifSound()),
        });
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
      try {
        await SmsReader.requestPermission();
      } catch {
        /* user may decline */
      }
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
      await pushRules();
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
      void scheduleWeeklyRecap();
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void drain();
        void pushRules();
        void consumeDeepLink();
        void scheduleWeeklyRecap();
      }
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
