"use client";

import { useQuery } from "@tanstack/react-query";
import { DEFAULT_FLAGS, parseFlags, type AppFlags } from "@/lib/config/flags";

export const APP_FLAGS_KEY = "app-flags";

/**
 * Runtime kill switches from /api/app-config.
 *
 * Returns the compiled-in defaults until the fetch lands and whenever it fails,
 * so a flag can only ever switch something OFF deliberately — never as a side
 * effect of being offline. Refetched hourly; a flip reaches an open session on
 * the next foreground.
 */
export function useAppFlags(): AppFlags {
  const { data } = useQuery({
    queryKey: [APP_FLAGS_KEY],
    queryFn: async () => {
      const res = await fetch("/api/app-config", { cache: "no-store" });
      if (!res.ok) throw new Error("app-config unavailable");
      const json = (await res.json()) as { flags?: unknown };
      return parseFlags(json.flags);
    },
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  return data ?? DEFAULT_FLAGS;
}
