import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { WhatsNewEntry } from "@/lib/whats-new/types";

const getWhatsNewEntries = vi.fn();
vi.mock("@/lib/actions/whatsNew", () => ({
  getWhatsNewEntries: () => getWhatsNewEntries(),
}));
vi.mock("@/lib/whats-new/inbox", () => ({
  syncWhatsNewInbox: vi.fn(async () => 0),
}));

import { seedWhatsNewFromCache, whatsNewQueryOptions, WHATS_NEW_KEY } from "./useWhatsNew";

/** Mirrors lib/providers/QueryProvider.tsx defaultOptions. */
function appQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

const entry = (id: string, at: string): WhatsNewEntry =>
  ({
    id,
    title: id,
    body_md: "",
    tags: [],
    image_url: null,
    published_at: at,
    notified_at: null,
  }) as unknown as WhatsNewEntry;

function stubStorage(seed: Record<string, string>) {
  const m = new Map(Object.entries(seed));
  const ls = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
  vi.stubGlobal("window", { localStorage: ls, dispatchEvent: vi.fn() });
  vi.stubGlobal("localStorage", ls);
}

afterEach(() => {
  vi.unstubAllGlobals();
  getWhatsNewEntries.mockReset();
});

describe("useWhatsNew cache contract", () => {
  const cached = [entry("old", "2026-10-01T00:00:00.000Z")];
  const fresh = [entry("new", "2026-10-30T00:00:00.000Z"), ...cached];

  beforeEach(() => {
    stubStorage({ "allocat-whats-new-cache": JSON.stringify(cached) });
    getWhatsNewEntries.mockResolvedValue(fresh);
  });

  it("refetches once on mount even when a cache from a previous session exists", async () => {
    const qc = appQueryClient();
    seedWhatsNewFromCache(qc);
    const observer = new QueryObserver(qc, whatsNewQueryOptions());
    const unsub = observer.subscribe(() => {});
    await vi.waitFor(() =>
      expect(qc.getQueryData(WHATS_NEW_KEY)).toEqual(fresh),
    );
    expect(getWhatsNewEntries).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("renders the cached entries before (and without) the network", async () => {
    getWhatsNewEntries.mockRejectedValue(new TypeError("offline"));
    const qc = appQueryClient();
    seedWhatsNewFromCache(qc);
    const observer = new QueryObserver(qc, { ...whatsNewQueryOptions(), retry: false });
    expect(observer.getCurrentResult().data).toEqual(cached);
    const unsub = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true));
    expect(observer.getCurrentResult().data).toEqual(cached);
    unsub();
  });

  it("does not refetch again within the stale window", async () => {
    const qc = appQueryClient();
    seedWhatsNewFromCache(qc);
    const a = new QueryObserver(qc, whatsNewQueryOptions());
    const ua = a.subscribe(() => {});
    await vi.waitFor(() => expect(qc.getQueryData(WHATS_NEW_KEY)).toEqual(fresh));
    const b = new QueryObserver(qc, whatsNewQueryOptions());
    const ub = b.subscribe(() => {});
    expect(getWhatsNewEntries).toHaveBeenCalledTimes(1);
    ua();
    ub();
  });

  it("never overwrites data already in the query cache", () => {
    const qc = appQueryClient();
    qc.setQueryData(WHATS_NEW_KEY, fresh);
    seedWhatsNewFromCache(qc);
    expect(qc.getQueryData(WHATS_NEW_KEY)).toEqual(fresh);
  });

  it("query options never read storage (SSR-safe)", () => {
    const opts = whatsNewQueryOptions() as Record<string, unknown>;
    expect(opts.initialData).toBeUndefined();
  });
});
