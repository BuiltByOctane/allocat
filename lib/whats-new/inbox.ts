import { getDB } from "@/lib/db";
import { recordNotification } from "@/lib/notify/history";
import { excerpt, inboxId, WHATS_NEW_URL } from "./format";
import type { WhatsNewEntry } from "./types";

const SEED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** Seed the device-local inbox with recently announced entries. Returns count recorded. */
export async function syncWhatsNewInbox(
  entries: WhatsNewEntry[],
  now = Date.now(),
): Promise<number> {
  const db = getDB();
  let n = 0;
  for (const e of entries) {
    if (!e.notified_at) continue;
    const t = Date.parse(e.notified_at);
    if (!Number.isFinite(t) || now - t > SEED_WINDOW_MS) continue;
    const id = inboxId(e.id);
    if (await db.notifications.get(id)) continue;
    await recordNotification({
      id,
      kind: "whats-new",
      title: e.title,
      body: excerpt(e.body_md),
      url: WHATS_NEW_URL,
    });
    n++;
  }
  return n;
}
