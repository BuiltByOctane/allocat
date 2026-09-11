import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Database } from "../types/database";

/**
 * Supabase client for this request.
 *
 * `cache()` scopes it to a single request, so the nested server actions that
 * make up one operation (an SMS ingest calls quickLogSpend, which calls
 * addAssetEntry, …) share one client instead of building a new one each time.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
});

/**
 * The authenticated user for this request, verified ONCE.
 *
 * `auth.getUser()` is a network call to Supabase Auth. Every action used to make
 * its own, so a single bulk SMS ingest paid roughly twenty of them inside one
 * invocation (ingest → quickLogSpend → addAssetEntry / makePayment → notify).
 * `cache()` collapses those to one per request; it never spans requests, so two
 * users can never share a result.
 *
 * Returns `null` when signed out — callers keep their own "Unauthorized"
 * handling.
 */
export const getAuthedUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
