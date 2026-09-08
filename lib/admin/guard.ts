import "server-only";
import { notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Who may open /admin.
 *
 * Server-only env (no NEXT_PUBLIC_ prefix), so the list never reaches the
 * browser bundle. Unset or empty ⇒ the portal is entirely unreachable, which is
 * the correct default for any deploy that isn't the owner's.
 */
function allowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowlist().includes(email.toLowerCase());
}

/**
 * Gate for every admin page, server action and route handler.
 *
 * Throws Next's NEXT_NOT_FOUND, so a non-admin sees a plain 404 rather than a
 * 403 — /admin should not advertise that it exists.
 *
 * Call this at the top of EVERY admin entry point, not just the layout: server
 * actions and route handlers are independently addressable and a layout check
 * does not protect them.
 */
export async function requireAdmin(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !user.email_confirmed_at || !isAdminEmail(user.email)) {
    notFound();
  }
  return user;
}
