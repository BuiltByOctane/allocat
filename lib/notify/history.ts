/**
 * Device-local notification inbox recorder.
 *
 * Notifications are generated on-device (native SMS/budget alerts via
 * `notifyLocal`), so their history lives on-device too — in the local-only
 * `notifications` IDB table. Nothing here syncs to the server.
 *
 * `emitNotification` is the single entry point that replaces bare `notifyLocal`
 * calls: it always records history, and fires the OS notification unless the
 * caller passes `{ silent: true }` (the closed-app drain path, where native
 * already showed the notification and we only need to backfill history).
 */
import { getDB } from "@/lib/db";
import type { NotifKind } from "@/lib/db/AllocatDB";
import { randomUUID } from "@/lib/utils/uuid";
import { notifyLocal } from "@/lib/native/notify";

/** Fired after a notification is recorded so `useNotifications` can refetch. */
export const NOTIF_EVENT = "allocat:notifications";

/** Keep the inbox small — it's a glanceable device-local log, not an archive. */
const MAX = 50;
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface NotificationInput {
  kind: NotifKind;
  title: string;
  body: string;
  url?: string;
}

/** Write a notification to the local inbox and prune to size + TTL. */
export async function recordNotification(entry: NotificationInput): Promise<void> {
  try {
    const db = getDB();
    const now = Date.now();
    await db.notifications.add({
      id: randomUUID(), // plain uuid — never touches the sync engine
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      url: entry.url,
      createdAt: now,
      read: false,
    });
    await pruneNotifications(now);
  } catch (err) {
    console.warn("[recordNotification] failed:", err);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NOTIF_EVENT));
  }
}

/** Drop rows past the TTL, then trim the newest-first list down to MAX. */
export async function pruneNotifications(now = Date.now()): Promise<void> {
  const db = getDB();
  await db.notifications.where("createdAt").below(now - TTL_MS).delete();
  const excess = await db.notifications
    .orderBy("createdAt")
    .reverse()
    .offset(MAX)
    .primaryKeys();
  if (excess.length) await db.notifications.bulkDelete(excess as string[]);
}

/** Record history, then fire the OS notification unless silent. */
export async function emitNotification(
  entry: NotificationInput,
  opts?: { silent?: boolean },
): Promise<void> {
  await recordNotification(entry);
  if (!opts?.silent) {
    await notifyLocal({ title: entry.title, body: entry.body, url: entry.url });
  }
}
