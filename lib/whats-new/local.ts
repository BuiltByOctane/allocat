import type { WhatsNewEntry } from "./types";

const SEEN_KEY = "allocat-whats-new-seen";
const CACHE_KEY = "allocat-whats-new-cache";
export const WHATS_NEW_SEEN_EVENT = "allocat:whats-new-seen";

function ls(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function storageAvailable(): boolean {
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
