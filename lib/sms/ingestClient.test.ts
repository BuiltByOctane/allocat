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
  sms_blocklist: makeTable(),
  budgets: makeTable(),
};

const dbStub = {
  ...tables,
  // Override budgets to support the "[month+year]" compound index query used by
  // loadPeriodContextIDB. The generic makeTable uses strict === which can't
  // compare array values produced by Dexie compound keys.
  budgets: {
    rows: tables.budgets.rows,
    async get(id: string) {
      return tables.budgets.rows.find((r) => r.id === id);
    },
    async add(row: Row) {
      tables.budgets.rows.push(row);
      return row.id;
    },
    async toArray() {
      return [...tables.budgets.rows];
    },
    where(field: string) {
      return {
        equals(value: unknown) {
          const serialized = JSON.stringify(value);
          return {
            async first() {
              return tables.budgets.rows.find((r) =>
                field === "[month+year]"
                  ? JSON.stringify([r.month, r.year]) === serialized
                  : r[field] === value,
              );
            },
            async toArray() {
              return tables.budgets.rows.filter((r) =>
                field === "[month+year]"
                  ? JSON.stringify([r.month, r.year]) === serialized
                  : r[field] === value,
              );
            },
          };
        },
      };
    },
  },
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

describe("ingestSmsClient — occurred_at uses the SMS receipt time (Bug F)", () => {
  beforeEach(() => {
    freshTables();
  });

  it("stores occurred_at from receivedAt (real clock time, not date-only 00:00)", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    // 2026-06-02 14:23:45 IST = 08:53:45 UTC.
    const receivedAt = Date.parse("2026-06-02T08:53:45.000Z");

    const res = await ingestSmsClient(
      { ...SMS, receivedAt },
      { enqueue },
      { silent: true },
    );
    expect(res.skipped).toBeFalsy();

    const row = tables.sms_transactions.rows[0];
    expect(row.occurred_at).toBe(new Date(receivedAt).toISOString());
    // Not a date-only string (which is what produced the wrong 05:30 display).
    expect(row.occurred_at).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // The synced payload carries the same precise timestamp.
    const payload = enqueue.mock.calls[0][0].payload as { occurredAt: string };
    expect(payload.occurredAt).toBe(new Date(receivedAt).toISOString());
  });

  it("falls back to a full timestamp when no receivedAt is given (dev paste)", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const res = await ingestSmsClient(SMS, { enqueue }, { silent: true });
    expect(res.skipped).toBeFalsy();

    const occurredAt = tables.sms_transactions.rows[0].occurred_at as string;
    // Always a full ISO timestamp now — never a bare date.
    expect(occurredAt).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(() => new Date(occurredAt).toISOString()).not.toThrow();
  });
});

describe("ingestSmsClient — overspend_count increment (Task 6)", () => {
  beforeEach(() => {
    freshTables();
  });

  it("increments overspend_count once when an auto-applied spend goes over plan", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);

    // Budget for the current period — no receivedAt is passed so ingestSmsClient
    // uses Date.now(), and loadPeriodContextIDB looks up [month+year] from that.
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    tables.budgets.rows.push({ id: "budget1", month, year, template_id: null });
    tables.categories.rows.push({ id: "cat1", budget_id: "budget1" });
    // planned_amount = 1000, actual_amount = 500 → debit of 1500 pushes
    // newActual (2000) past planned (1000), so overspend_count must go to 1.
    tables.budget_items.rows.push({
      id: "item1",
      category_id: "cat1",
      planned_amount: 1000,
      actual_amount: 500,
      overspend_count: 0,
      template_id: null,
      template_item_id: null,
    });
    // Legacy rule (no template_id/template_item_id): resolves via budget_item_id
    // existing in this period's items list.
    tables.merchant_rules.rows.push({
      id: "rule1",
      pattern: "amazon",
      match_type: "exact",
      auto_apply: true,
      budget_item_id: "item1",
      template_id: null,
      template_item_id: null,
    });

    // SMS debits Rs.1,500 at amazon@ybl — matches rule1 → auto-applies to item1.
    const result = await ingestSmsClient(SMS, { enqueue }, { silent: true });

    expect(result.skipped).toBeFalsy();
    expect(result.autoApplied).toBe(true);

    const item = tables.budget_items.rows.find((r) => r.id === "item1");
    expect(item?.overspend_count).toBe(1);
  });
});
