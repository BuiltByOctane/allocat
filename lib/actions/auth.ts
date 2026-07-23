"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateAppMode } from "@/lib/actions/profile";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  await updateAppMode("web");

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("full_name") as string;

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // If email confirmation is off, this practically logs them in
  revalidatePath("/", "layout");
  redirect("/onboarding");
}

/**
 * Clears the server session cookie. Does NOT redirect — the client must wipe its
 * local state (`clearClientSession()`) and then hard-navigate, so the in-memory
 * React Query cache and the previous user's IndexedDB data don't leak into the
 * next account on the same device.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
}

/**
 * Permanently deletes the signed-in user's account and all associated data.
 *
 * Required by Google Play's account-deletion policy. Deleting the auth user
 * cascades (every public.* table has `user_id ... references auth.users(id)
 * on delete cascade`) so all of the user's rows are removed server-side. The
 * service-role client is needed because `auth.admin.deleteUser` is privileged.
 *
 * Returns instead of redirecting so the client can wipe the local IDB cache
 * (`clearDB()`) before navigating away.
 */
export async function deleteAccount(): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return { error: "Not authenticated." };
  }

  const admin = createServiceClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return { error: error.message };
  }

  // Session cookie now points at a deleted user; clear it. The user is already
  // gone, so ignore any error from sign-out.
  try {
    await supabase.auth.signOut();
  } catch {
    /* ignore */
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
