import { describe, it, expect, vi, beforeEach } from "vitest";

const record = vi.fn(async (_e?: unknown) => {});
const existing = new Set<string>();
vi.mock("@/lib/notify/history", () => ({ recordNotification: (e: unknown) => record(e) }));
vi.mock("@/lib/db", () => ({
  getDB: () => ({
    notifications: { get: async (id: string) => (existing.has(id) ? { id } : undefined) },
  }),
}));

import { syncWhatsNewInbox } from "./inbox";
import type { WhatsNewEntry } from "./types";

const NOW = Date.parse("2026-10-31T00:00:00.000Z");
const day = 86400000;
const entry = (id: string, notifiedAgoDays: number | null): WhatsNewEntry => ({
  id,
  title: `T ${id}`,
  body_md: "Hello **world**.",
  tags: [],
  image_url: null,
  published_at: new Date(NOW - day).toISOString(),
  notified_at: notifiedAgoDays === null ? null : new Date(NOW - notifiedAgoDays * day).toISOString(),
  updated_at: new Date(NOW).toISOString(),
});

beforeEach(() => {
  record.mockClear();
  existing.clear();
});

describe("syncWhatsNewInbox", () => {
  it("records a recent notified entry", async () => {
    expect(await syncWhatsNewInbox([entry("a", 1)], NOW)).toBe(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ id: "whats-new:a", kind: "whats-new", title: "T a", body: "Hello world." }),
    );
  });
  it("skips already present", async () => {
    existing.add("whats-new:a");
    expect(await syncWhatsNewInbox([entry("a", 1)], NOW)).toBe(0);
    expect(record).not.toHaveBeenCalled();
  });
  it("skips older than 14 days", async () => {
    expect(await syncWhatsNewInbox([entry("a", 20)], NOW)).toBe(0);
  });
  it("skips null notified_at", async () => {
    expect(await syncWhatsNewInbox([entry("a", null)], NOW)).toBe(0);
  });
});
