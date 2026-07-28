import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Local notification inbox recorder.
 *
 * recordNotification writes a row to the device-local `notifications` IDB table
 * and prunes it: newest MAX (50) kept, plus a 30-day TTL. No fake-indexeddb dep
 * in this repo, so we inject an in-memory table modelling the exact Dexie surface
 * recordNotification / pruneNotifications touch. The prune + record logic under
 * test is the REAL module code; only storage is stubbed.
 */

interface Row {
  id: string;
  createdAt: number;
  [k: string]: unknown;
}

function makeNotifTable(seed: Row[] = []) {
  let rows: Row[] = [...seed];
  return {
    get rows() {
      return rows;
    },
    async add(r: Row) {
      rows.push(r);
      return r.id;
    },
    async bulkDelete(ids: string[]) {
      rows = rows.filter((r) => !ids.includes(r.id));
    },
    where(field: string) {
      return {
        below(v: number) {
          return {
            async delete() {
              const before = rows.length;
              rows = rows.filter((r) => !((r[field] as number) < v));
              return before - rows.length;
            },
          };
        },
      };
    },
    orderBy(field: string) {
      const build = (arr: Row[]) => ({
        reverse: () => build([...arr].reverse()),
        offset: (n: number) => build(arr.slice(n)),
        async primaryKeys() {
          return arr.map((r) => r.id);
        },
        async toArray() {
          return arr;
        },
      });
      return build([...rows].sort((a, b) => (a[field] as number) - (b[field] as number)));
    },
    async count() {
      return rows.length;
    },
  };
}

let notifications = makeNotifTable();
const notifyLocalMock = vi.fn();

vi.mock("@/lib/db", () => ({
  getDB: () => ({ notifications }),
}));
vi.mock("@/lib/native/notify", () => ({
  notifyLocal: (...args: unknown[]) => notifyLocalMock(...args),
}));

import { recordNotification, emitNotification } from "./history";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  notifications = makeNotifTable();
  notifyLocalMock.mockReset();
});

describe("recordNotification", () => {
  it("adds a row with defaults (unread, uuid id, timestamp)", async () => {
    await recordNotification({ kind: "wild-spend", title: "T", body: "B", url: "/sms" });
    expect(notifications.rows).toHaveLength(1);
    const r = notifications.rows[0];
    expect(r.read).toBe(false);
    expect(r.id).toMatch(/[0-9a-f-]{36}/);
    expect(r.id.startsWith("temp_")).toBe(false);
    expect(typeof r.createdAt).toBe("number");
    expect(r).toMatchObject({ kind: "wild-spend", title: "T", body: "B", url: "/sms" });
  });

  it("prunes rows older than the 30-day TTL", async () => {
    const old = Date.now() - 31 * DAY;
    notifications.rows.push({ id: "old", createdAt: old, kind: "other", title: "x", body: "y", read: true });
    await recordNotification({ kind: "other", title: "new", body: "z" });
    const ids = notifications.rows.map((r) => r.id);
    expect(ids).not.toContain("old");
    expect(notifications.rows).toHaveLength(1);
  });

  it("caps the inbox at 50, dropping the oldest", async () => {
    const base = Date.now() - 10_000; // safely in the past so the new row is newest
    for (let i = 0; i < 55; i++) {
      notifications.rows.push({ id: `n${i}`, createdAt: base + i, kind: "other", title: `${i}`, body: "", read: true });
    }
    await recordNotification({ kind: "other", title: "newest", body: "" });
    expect(await notifications.count()).toBe(50);
    // oldest survivors dropped; newest kept
    const titles = notifications.rows.map((r) => r.title);
    expect(titles).toContain("newest");
    expect(titles).not.toContain("0");
  });
});

describe("emitNotification", () => {
  it("records and fires the OS notification when not silent", async () => {
    await emitNotification({ kind: "near-limit", title: "T", body: "B", url: "/budget" });
    expect(notifications.rows).toHaveLength(1);
    expect(notifyLocalMock).toHaveBeenCalledWith({ title: "T", body: "B", url: "/budget" });
  });

  it("records but suppresses the OS notification when silent", async () => {
    await emitNotification({ kind: "near-limit", title: "T", body: "B" }, { silent: true });
    expect(notifications.rows).toHaveLength(1);
    expect(notifyLocalMock).not.toHaveBeenCalled();
  });
});
