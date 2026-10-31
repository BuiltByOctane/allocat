import type { WhatsNewEntry } from "./types";

const SEEN_KEY = "allocat-whats-new-seen";
const INBOXED_KEY = "allocat-whats-new-inboxed";
const CACHE_KEY = "allocat-whats-new-cache";
export const WHATS_NEW_SEEN_EVENT = "allocat:whats-new-seen";

function ls(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

let available: boolean | undefined;

/** Probed once per page load: the probe write fires `storage` events in other tabs. */
export function storageAvailable(): boolean {
  if (available !== undefined) return available;
  available = probe();
  return available;
}

/** Test hook: forget the memoized probe result. */
export function resetStorageProbe(): void {
  available = undefined;
}

function probe(): boolean {
  try {
    const s = ls();
    if (!s) return false;
    const k = "allocat-whats-new-probe";
    s.setItem(k, "1");
    s.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function readSeenAt(): string | null {
  try {
    return ls()?.getItem(SEEN_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Only moves forward; notifies subscribers in this tab. */
export function markSeen(publishedAt: string): void {
  try {
    const cur = readSeenAt();
    if (cur && Date.parse(cur) >= Date.parse(publishedAt)) return;
    ls()?.setItem(SEEN_KEY, publishedAt);
  } catch {
    /* storage unavailable */
  }
  try {
    window.dispatchEvent(new Event(WHATS_NEW_SEEN_EVENT));
  } catch {
    /* no window */
  }
}

export function readCache(): WhatsNewEntry[] | undefined {
  try {
    const raw = ls()?.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as WhatsNewEntry[]) : undefined;
  } catch {
    return undefined;
  }
}

export function writeCache(e: WhatsNewEntry[]): void {
  try {
    ls()?.setItem(CACHE_KEY, JSON.stringify(e));
  } catch {
    /* quota / unavailable */
  }
}

export function readInboxed(): string[] {
  try {
    const raw = ls()?.getItem(INBOXED_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Remember ids already seeded into the inbox; keeps the newest 100. */
export function addInboxed(ids: string[]): void {
  try {
    const next = [...readInboxed().filter((i) => !ids.includes(i)), ...ids].slice(-100);
    ls()?.setItem(INBOXED_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}
