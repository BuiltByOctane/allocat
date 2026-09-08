/**
 * Validate a post-login redirect target taken from a query string.
 *
 * The callback route builds `${origin}${next}`. Anything that doesn't start
 * with exactly one "/" can escape the origin: `@evil.com` becomes
 * `https://allocat.xyz@evil.com` (userinfo → host evil.com), `//evil.com` is
 * protocol-relative, and `/\evil.com` is normalised by browsers to `//`.
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
