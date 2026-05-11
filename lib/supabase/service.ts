import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

/**
 * Service-role Supabase client. Bypasses RLS — use only inside server actions
 * for cross-user operations (e.g., dispatching push notifications).
 * Do NOT export this from any module reachable by client code.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase service client missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
