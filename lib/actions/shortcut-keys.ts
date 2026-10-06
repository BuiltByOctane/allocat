"use server";

import { getAuthedUser } from "@/lib/supabase/server";
import {
  createShortcutKeyForUser,
  revokeShortcutKeysForUser,
  getShortcutKeyStatusForUser,
  type ShortcutKeyStatus,
} from "@/lib/server/shortcut-keys";

/**
 * iPhone shortcut key management for the signed-in user. Called directly (not
 * via the sync queue): the key is shown once and must come from the server.
 */

async function requireUserId(): Promise<string> {
  const user = await getAuthedUser();
  if (!user) throw new Error("Unauthorized");
  return user.id;
}

/** Revokes any previous key and returns the new plaintext — shown exactly once. */
export async function createShortcutKey(): Promise<{ key: string; prefix: string }> {
  return createShortcutKeyForUser(await requireUserId());
}

export async function revokeShortcutKey(): Promise<{ ok: true }> {
  await revokeShortcutKeysForUser(await requireUserId());
  return { ok: true };
}

export async function getShortcutKeyStatus(): Promise<ShortcutKeyStatus> {
  return getShortcutKeyStatusForUser(await requireUserId());
}
