import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { getDB } from "@/lib/db";
import type { ProfileRow } from "@/lib/db/AllocatDB";

export const PROFILE_KEY = ["profile"] as const;

async function getProfileFromIDB(): Promise<ProfileRow | null> {
  const db = getDB();
  const all = await db.profiles.toArray();
  return all[0] ?? null;
}

export function useProfile() {
  return useQuery({
    queryKey: PROFILE_KEY,
    queryFn: async () => {
      const local = await getProfileFromIDB();
      if (local) return local;

      // IDB miss — fall back to Supabase (first load / not hydrated yet)
      const supabase = createClient();
      // Local session read — getUser() would add an Auth round trip; RLS
      // enforces ownership on the select below anyway.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw new Error(error.message);
      return data as ProfileRow;
    },
    staleTime: Infinity,
  });
}
