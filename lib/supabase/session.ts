import type { SupabaseClient } from "@supabase/supabase-js";

export type SessionUser = { id: string; email: string | null };

/**
 * Resolve the signed-in user, preferring local JWT verification.
 *
 * `getClaims()` verifies the access token against the cached JWKS with no
 * network round trip, but it only exists on @supabase/auth-js >= ~2.70; the
 * version pinned by supabase-js 2.49.1 (auth-js 2.68.0) does not have it. So we
 * feature-detect: where it exists we use it, everywhere else we fall back to the
 * authoritative `getUser()` network call. Behaviour is identical either way —
 * only the round trip differs — so bumping supabase-js later is what actually
 * turns the optimisation on.
 */
export async function getSessionUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
): Promise<SessionUser | null> {
  const auth = supabase.auth as unknown as {
    getClaims?: () => Promise<{
      data: { claims?: Record<string, unknown> } | null;
      error: unknown;
    }>;
  };

  if (typeof auth.getClaims === "function") {
    try {
      const { data, error } = await auth.getClaims();
      if (!error) {
        const sub = data?.claims?.sub;
        if (typeof sub !== "string" || !sub) return null;
        const email = data?.claims?.email;
        return { id: sub, email: typeof email === "string" ? email : null };
      }
    } catch {
      // fall through to getUser
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
}
