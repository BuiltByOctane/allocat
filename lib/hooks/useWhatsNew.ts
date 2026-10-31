"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { getWhatsNewEntries } from "@/lib/actions/whatsNew";
import { isUnseen } from "@/lib/whats-new/format";
import { syncWhatsNewInbox } from "@/lib/whats-new/inbox";
import {
  readCache,
  readSeenAt,
  storageAvailable,
  writeCache,
  WHATS_NEW_SEEN_EVENT,
} from "@/lib/whats-new/local";
import type { WhatsNewEntry } from "@/lib/whats-new/types";

export const WHATS_NEW_KEY = ["whats-new"] as const;

/** Query options for the changelog; exported so the cache/refetch contract is testable. */
export function whatsNewQueryOptions() {
  return {
    queryKey: WHATS_NEW_KEY,
    queryFn: async (): Promise<WhatsNewEntry[]> => {
      const entries = await getWhatsNewEntries();
      writeCache(entries);
      void syncWhatsNewInbox(entries).catch((err) =>
        console.warn("[whats-new] inbox sync failed:", err),
      );
      return entries;
    },
    // The app default is staleTime: Infinity (IDB owns freshness). This query is
    // not IDB-backed, so it needs its own window or a device would never refetch.
    staleTime: 5 * 60_000,
  };
}

/**
 * Seed React Query from the localStorage copy so offline / cold starts render
 * immediately. `updatedAt: 0` marks it stale, so the mount still refetches.
 * Runs after mount (never during render) to keep SSR and hydration identical.
 */
export function seedWhatsNewFromCache(qc: QueryClient): void {
  if (qc.getQueryData(WHATS_NEW_KEY) !== undefined) return;
  const cached = readCache();
  if (cached) qc.setQueryData<WhatsNewEntry[]>(WHATS_NEW_KEY, cached, { updatedAt: 0 });
}

export function useWhatsNew() {
  const qc = useQueryClient();
  // Declared before useQuery so the seed lands before the observer subscribes.
  useEffect(() => seedWhatsNewFromCache(qc), [qc]);
  return useQuery<WhatsNewEntry[]>(whatsNewQueryOptions());
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === "allocat-whats-new-seen") cb();
  };
  window.addEventListener(WHATS_NEW_SEEN_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(WHATS_NEW_SEEN_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

const NO_STORE = Symbol("no-store");
const getSnapshot = (): string | null | typeof NO_STORE =>
  storageAvailable() ? readSeenAt() : NO_STORE;
const getServerSnapshot = (): typeof NO_STORE => NO_STORE;

export function useWhatsNewUnseen(): { unseen: boolean; latest?: WhatsNewEntry } {
  const latest = useWhatsNew().data?.[0];
  const seen = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (seen === NO_STORE) return { unseen: false, latest };
  return { unseen: isUnseen(latest?.published_at, seen), latest };
}
