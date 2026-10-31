"use client";

import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
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

export function useWhatsNew() {
  return useQuery<WhatsNewEntry[]>({
    queryKey: WHATS_NEW_KEY,
    queryFn: async () => {
      const entries = await getWhatsNewEntries();
      writeCache(entries);
      void syncWhatsNewInbox(entries).catch((err) =>
        console.warn("[whats-new] inbox sync failed:", err),
      );
      return entries;
    },
    initialData: () => readCache(),
    initialDataUpdatedAt: 0,
  });
}

function subscribe(cb: () => void) {
  window.addEventListener(WHATS_NEW_SEEN_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(WHATS_NEW_SEEN_EVENT, cb);
    window.removeEventListener("storage", cb);
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
