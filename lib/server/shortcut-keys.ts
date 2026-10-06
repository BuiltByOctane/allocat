import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import {
  generateShortcutKey,
  hashShortcutKey,
  displayPrefix,
} from "@/lib/shortcut/key";

/**
 * Storage for iPhone shortcut keys. `shortcut_keys` has RLS on with zero
 * policies, so every read/write goes through the service client — callers must
 * already know which user they act for (a cookie-authed action, or a key that
 * resolved to its owner).
 */

export interface ShortcutKeyStatus {
  active: boolean;
  prefix: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  lastCaptureAt: string | null;
}

const NO_KEY: ShortcutKeyStatus = {
  active: false,
  prefix: null,
  createdAt: null,
  lastUsedAt: null,
  lastCaptureAt: null,
};

/** Revoke the user's live key (if any) and mint a new one. Returns the plaintext once. */
export async function createShortcutKeyForUser(
  userId: string,
): Promise<{ key: string; prefix: string }> {
  const supabase = createServiceClient();
  await revokeShortcutKeysForUser(userId);

  const key = generateShortcutKey();
  const prefix = displayPrefix(key);
  const { error } = await supabase.from("shortcut_keys").insert({
    user_id: userId,
    key_hash: hashShortcutKey(key),
    key_prefix: prefix,
  });
  if (error) throw new Error(error.message);
  return { key, prefix };
}

export async function revokeShortcutKeysForUser(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("shortcut_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}

export async function getShortcutKeyStatusForUser(
  userId: string,
): Promise<ShortcutKeyStatus> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("shortcut_keys")
    .select("key_prefix, created_at, last_used_at, last_capture_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return NO_KEY;
  return {
    active: true,
    prefix: data.key_prefix,
    createdAt: data.created_at,
    lastUsedAt: data.last_used_at,
    lastCaptureAt: data.last_capture_at,
  };
}

/**
 * Resolve a plaintext key to its owner. Returns null for an unknown or revoked
 * key. Stamps `last_used_at` so the setup screen can show the shortcut is
 * connected even before the first real spend arrives.
 */
export async function resolveShortcutKey(
  key: string,
): Promise<{ keyId: string; userId: string } | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("shortcut_keys")
    .select("id, user_id")
    .eq("key_hash", hashShortcutKey(key))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;

  await supabase
    .from("shortcut_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  return { keyId: data.id, userId: data.user_id };
}

export async function markShortcutCapture(keyId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("shortcut_keys")
    .update({ last_capture_at: new Date().toISOString() })
    .eq("id", keyId);
}
