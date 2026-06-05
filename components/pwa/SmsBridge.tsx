"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { SmsReader, type CapturedSms } from "@/lib/native/SmsReader";
import { useEnqueue } from "@/lib/hooks/useSync";
import { ingestSmsClient } from "@/lib/sms/ingestClient";
import { scheduleWeeklyRecap } from "@/lib/sms/recap";
import { confirmAutoAllocate } from "@/lib/sms/notifPrefs";
import { getDB } from "@/lib/db";

/**
 * Native-only bridge between the SMS plugin and the web ingest pipeline.
 *
 * - App OPEN: receives live "smsReceived" events → ingest (which notifies).
 * - App CLOSED: the native receiver parses + notifies itself; the raw SMS is
 *   queued. On next open we drain the queue SILENTLY (native already notified)
 *   so the spend is logged/synced without a duplicate notification.
 * - Pushes merchant rules to native so closed-app notifications can name the
 *   matched category, and consumes the deep-link from a tapped notification.
 */
export function SmsBridge() {
  const enqueue = useEnqueue();
  const enqueueRef = useRef(enqueue);
  useEffect(() => {
    enqueueRef.current = enqueue;
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let smsListener: PluginListenerHandle | undefined;
    let notifTap: PluginListenerHandle | undefined;

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
    const drain = async () => {
      try {
        const { messages } = await SmsReader.getQueued();
        for (const m of messages) await handle(m, true);
      } catch (err) {
        console.warn("[SmsBridge] drain failed:", err);
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
        await SmsReader.setConfig({ confirmAutoAllocate: confirmAutoAllocate() });
      } catch {
        /* ignore */
      }
    };

    // A tapped native notification stashes a deep-link; follow it.
    const consumeDeepLink = async () => {
      try {
        const { url } = await SmsReader.consumeDeepLink();
        if (url && !window.location.pathname.startsWith(url)) {
          window.location.assign(url);
        }
      } catch {
        /* ignore */
      }
    };

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
        smsListener = await SmsReader.addListener("smsReceived", (m) => {
          void handle(m, false);
        });
      } catch {
        /* plugin unavailable */
      }
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
      void smsListener?.remove();
      void notifTap?.remove();
    };
  }, []);

  return null;
}
