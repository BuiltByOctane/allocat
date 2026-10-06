/**
 * iPhone shortcut keys — the pure part (no Supabase, no Next).
 *
 * A key is `alc_` + 32 random bytes (base64url). Only its SHA-256 hash is
 * stored (`shortcut_keys.key_hash`), so a database leak does not leak working
 * keys. A hash lookup needs no constant-time compare: an attacker cannot learn
 * anything from timing the comparison of a hash they cannot choose.
 *
 * Server-only by usage (node:crypto); kept out of `lib/server/` so tests can
 * import it without stubbing `server-only`.
 */
import { createHash, randomBytes } from "node:crypto";

export const SHORTCUT_KEY_PREFIX = "alc_";

/**
 * The text the shared shortcut ships with. A request carrying it means the
 * user added the shortcut but never pasted their key.
 */
export const SHORTCUT_KEY_PLACEHOLDER = "PASTE-YOUR-ALLOCAT-KEY-HERE";

/** Characters of the plaintext kept for display ("alc_Ab12…"). */
const DISPLAY_PREFIX_LEN = 8;

export function generateShortcutKey(): string {
  return SHORTCUT_KEY_PREFIX + randomBytes(32).toString("base64url");
}

export function hashShortcutKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function displayPrefix(key: string): string {
  return key.slice(0, DISPLAY_PREFIX_LEN);
}

export type BearerResult =
  | { kind: "key"; key: string }
  | { kind: "missing" }
  | { kind: "placeholder" }
  | { kind: "malformed" };

/**
 * Pull the key out of an `Authorization: Bearer <key>` header.
 *
 * Users paste the key by hand, so stray whitespace/newlines around it are
 * forgiven. The placeholder is reported separately so the reply can tell the
 * user exactly what to fix.
 */
export function parseShortcutBearer(header: string | null): BearerResult {
  if (!header) return { kind: "missing" };
  const m = /^\s*Bearer\s+([\s\S]*)$/i.exec(header);
  const value = (m ? m[1] : header).trim();
  if (!value) return { kind: "missing" };
  if (value.includes(SHORTCUT_KEY_PLACEHOLDER)) return { kind: "placeholder" };
  if (!value.startsWith(SHORTCUT_KEY_PREFIX) || value.length > 128 || /\s/.test(value)) {
    return { kind: "malformed" };
  }
  return { kind: "key", key: value };
}
