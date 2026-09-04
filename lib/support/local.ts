import { getDB } from "@/lib/db";

/**
 * Mirror supporter status into the IDB profile row.
 *
 * Reads go through IndexedDB first (see lib/hooks/useProfile.ts), so flipping
 * the flag server-side isn't visible until the cached row is patched or the
 * next hydration runs. Browser-only — `getDB()` throws on the server.
 */
export async function markSupporterLocally(since?: string): Promise<void> {
  const db = getDB();
  const rows = await db.profiles.toArray();
  const profile = rows[0];
  if (!profile) return;

  await db.profiles.update(profile.id, {
    is_supporter: true,
    supporter_since: profile.supporter_since ?? since ?? new Date().toISOString(),
  });
}
