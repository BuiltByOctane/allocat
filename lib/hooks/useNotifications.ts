"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDB, type NotificationRow } from "@/lib/db";
import { NOTIF_EVENT } from "@/lib/notify/history";

export const NOTIFICATIONS_KEY = ["notifications"] as const;

/** Newest-first read of the device-local notification inbox. */
export async function getNotificationsFromIDB(): Promise<NotificationRow[]> {
  const db = getDB();
  return db.notifications.orderBy("createdAt").reverse().toArray();
}

/**
 * Reads the local inbox and refetches whenever a new notification is recorded
 * (the `allocat:notifications` window event fired by recordNotification).
 */
export function useNotifications() {
  const qc = useQueryClient();

  useEffect(() => {
    const invalidate = () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    window.addEventListener(NOTIF_EVENT, invalidate);
    return () => window.removeEventListener(NOTIF_EVENT, invalidate);
  }, [qc]);

  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: getNotificationsFromIDB,
  });
}

/** Unread count derived from the same cached query (no extra IDB read). */
export function useUnreadCount(): number {
  const { data } = useNotifications();
  return (data ?? []).filter((n) => !n.read).length;
}

// ─── Local mutations (no sync — this table never leaves the device) ────────────

export function useNotificationActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });

  const markRead = async (id: string) => {
    await getDB().notifications.update(id, { read: true });
    await invalidate();
  };

  const markAllRead = async () => {
    const db = getDB();
    const unread = await db.notifications.filter((n) => !n.read).primaryKeys();
    if (unread.length) {
      await db.notifications.bulkUpdate(
        unread.map((key) => ({ key, changes: { read: true } })),
      );
    }
    await invalidate();
  };

  const removeOne = async (id: string) => {
    await getDB().notifications.delete(id);
    await invalidate();
  };

  const clearAll = async () => {
    await getDB().notifications.clear();
    await invalidate();
  };

  return { markRead, markAllRead, removeOne, clearAll };
}
