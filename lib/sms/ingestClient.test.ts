import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Bug 5 — duplicate SMS rows.
 *
 * Two concurrent ingests of the SAME SMS (the live `smsReceived` event AND the
 * native-queue drain on open) used to both clear a non-atomic dedupe check and
 * each `.add()` a row. ingestSmsClient now guards with a synchronous module-level
 * in-flight Set (rejects the racing caller before its async dedupe check) and an
 * atomic readwrite transaction that re-checks the dedupe key before insert.
 *
 * IDB test infra (fake-indexeddb / jsdom) is NOT available in this repo, so this
 * test injects a faithful in-memory `getDB()` stub that models the exact Dexie
 * surface ingestSmsClient touches. The in-flight Set + dedupe logic exercised
 * here are the REAL module code; only the storage layer is stubbed. (A future
 * fake-indexeddb dependency would let this assert the transaction backstop
 * across a simulated reload too.)
 */

// ── In-memory Dexie-shaped stub ────────────────────────────────────────────
interface Row {
  id: string;
  dedupe_key?: string;
  [k: string]: unknown;
}

function makeTable(seed: Row[] = []) {
  const rows = [...seed];
  return {
    rows,
    where(field: string) {
      return {
        equals(value: unknown) {
          return {
            async first() {
              return rows.find((r) => r[field] === value);
            },
            async toArray() {
              return rows.filter((r) => r[field] === value);
            },
          };
        },
      };
    },
    async add(row: Row) {
      rows.push(row);
      return row.id;
    },
    async get(id: string) {
      return rows.find((r) => r.id === id);
    },
    async update(id: string, changes: Record<string, unknown>) {
      const r = rows.find((x) => x.id === id);
      if (r) Object.assign(r, changes);
      return r ? 1 : 0;
    },
    async toArray() {
      return [...rows];
    },
  };
}

const tables = {
  sms_transactions: makeTable(),
  budget_items: makeTable(),
  merchant_rules: makeTable(),
  categories: makeTable(),
};

const dbStub = {
  ...tables,
  // Dexie's transaction serializes its callback; in single-threaded JS our
  // callback runs to its first await atomically w.r.t. the synchronous re-check,
  // which is what the dedupe guard relies on. Just run and return the result.
  async transaction(_mode: string, ..._args: unknown[]) {
    const cb = _args[_args.length - 1] as () => Promise<unknown>;
    return cb();
  },
};

vi.mock("@/lib/db", () => ({
  getDB: () => dbStub,
}));

// Keep the test hermetic — notifications are a no-op on web anyway, and we pass
// { silent: true } so the notify branch is never reached.
vi.mock("@/lib/native/notify", () => ({ notifyLocal: vi.fn() }));

import { ingestSmsClient } from "./ingestClient";

const SMS = {
  raw: "Rs.1,500.00 debited from a/c **1234 on 02-06-26 to VPA amazon@ybl. Avl Bal Rs.10,000.00",
  sender: "HDFCBK",
};

function freshTables() {
  for (const t of Object.values(tables)) t.rows.length = 0;
}

describe("ingestSmsClient — dedupe under concurrency (Bug 5)", () => {
  beforeEach(() => {
    freshTables();
  });

  it("writes exactly ONE sms_transactions row for two CONCURRENT identical ingests", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const [a, b] = await Promise.all([
      ingestSmsClient(SMS, { enqueue }, { silent: true }),
      ingestSmsClient(SMS, { enqueue }, { silent: true }),
    ]);

    // Exactly one row persisted.
    expect(tables.sms_transactions.rows).toHaveLength(1);

    // One call inserted; the other was rejected by the in-flight / dedupe guard.
    const outcomes = [a, b];
    const inserted = outcomes.filter((r) => !r.skipped);
    const skipped = outcomes.filter((r) => r.skipped);
    expect(inserted).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toMatch(/in-flight|duplicate/);

    // Only the successful insert enqueued a sync op.
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("drops a later identical ingest via the durable IDB dedupe check", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const first = await ingestSmsClient(SMS, { enqueue }, { silent: true });
    expect(first.skipped).toBeFalsy();

    // In-flight Set is now clear; the second pass must hit the IDB dedupe check.
    const second = await ingestSmsClient(SMS, { enqueue }, { silent: true });
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe("duplicate");

    expect(tables.sms_transactions.rows).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});

describe("ingestSmsClient — OTP / non-debit rejection", () => {
  beforeEach(() => {
    freshTables();
  });

  it("skips an OTP / pre-auth SMS without recording a row", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const res = await ingestSmsClient(
      { raw: "Confirm debit of Rs 5000 to Flipkart. OTP 123456.", sender: "HDFCBK" },
      { enqueue },
      { silent: true },
    );
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe("otp");
    expect(tables.sms_transactions.rows).toHaveLength(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("skips an amount-only SMS with no debit cue (no isDebit fallback)", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const res = await ingestSmsClient(
      { raw: "Your balance at SHOP is Rs 200", sender: "XX" },
      { enqueue },
      { silent: true },
    );
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe("no-debit");
    expect(tables.sms_transactions.rows).toHaveLength(0);
  });

  it("still records a genuine debit SMS (regression guard)", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const res = await ingestSmsClient(SMS, { enqueue }, { silent: true });
    expect(res.skipped).toBeFalsy();
    expect(tables.sms_transactions.rows).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
