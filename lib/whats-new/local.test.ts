import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { markSeen, readSeenAt, readCache, writeCache, storageAvailable, resetStorageProbe, readInboxed, addInboxed, clearInboxed } from "./local";

function stubStorage() {
  const m = new Map<string, string>();
  const ls = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
  vi.stubGlobal("window", { localStorage: ls, dispatchEvent: vi.fn() });
  vi.stubGlobal("localStorage", ls);
  return m;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetStorageProbe();
});

describe("whats-new local", () => {
  beforeEach(() => void stubStorage());

  it("markSeen then readSeenAt", () => {
    markSeen("2026-10-01T00:00:00.000Z");
    expect(readSeenAt()).toBe("2026-10-01T00:00:00.000Z");
  });
  it("only moves forward", () => {
    markSeen("2026-10-05T00:00:00.000Z");
    markSeen("2026-10-01T00:00:00.000Z");
    expect(readSeenAt()).toBe("2026-10-05T00:00:00.000Z");
  });
  it("corrupt cache -> undefined", () => {
    localStorage.setItem("allocat-whats-new-cache", "{nope");
    expect(readCache()).toBeUndefined();
  });
  it("cache roundtrip", () => {
    writeCache([]);
    expect(readCache()).toEqual([]);
  });
});

describe("throwing storage", () => {
  it("never throws", () => {
    const boom = () => {
      throw new Error("denied");
    };
    const ls = { getItem: boom, setItem: boom, removeItem: boom };
    vi.stubGlobal("window", { localStorage: ls, dispatchEvent: vi.fn() });
    vi.stubGlobal("localStorage", ls);
    expect(readSeenAt()).toBeNull();
    expect(storageAvailable()).toBe(false);
    expect(() => markSeen("2026-10-01T00:00:00.000Z")).not.toThrow();
    expect(readCache()).toBeUndefined();
    expect(() => writeCache([])).not.toThrow();
    expect(() => clearInboxed()).not.toThrow();
  });
});

describe("inboxed ids", () => {
  it("roundtrips and caps at 100", () => {
    stubStorage();
    addInboxed(Array.from({ length: 120 }, (_, i) => `e${i}`));
    const r = readInboxed();
    expect(r).toHaveLength(100);
    expect(r[99]).toBe("e119");
  });

  it("clearInboxed forgets seeded ids (sign-out) and leaves the seen key", () => {
    const m = stubStorage();
    addInboxed(["a", "b"]);
    markSeen("2026-10-01T00:00:00.000Z");
    clearInboxed();
    expect(readInboxed()).toEqual([]);
    expect(m.has("allocat-whats-new-inboxed")).toBe(false);
    expect(readSeenAt()).toBe("2026-10-01T00:00:00.000Z");
  });
});
