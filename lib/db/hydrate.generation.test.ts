import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Wipe-generation guard.
 *
 * A pull that is already in flight when the user signs out (or switches
 * account) must NEVER write its payload into the freshly cleared IDB — that
 * resurrected the previous user's rows and, on a shared device, showed them to
 * whoever signed in next. `clearDB()` bumps a generation counter and every
 * write phase re-checks it.
 */

// ── Minimal Dexie-shaped stub (no fake-indexeddb in this repo) ─────────────
type Row = Record<string, unknown>;

const written: Record<string, Row[]> = {};
const cleared: string[] = [];

function makeTable(name: string) {
  return {
    async bulkPut(rows: Row[]) {
      written[name] = [...(written[name] ?? []), ...rows];
    },
    async bulkDelete() {},
    async toArray() {
      return [] as Row[];
    },
    async get() {
      return undefined;
    },
    async put() {},
    async clear() {
      cleared.push(name);
    },
    where() {
      return {
        anyOf: () => ({ toArray: async () => [] as Row[] }),
        equals: () => ({ toArray: async () => [] as Row[] }),
      };
    },
  };
}

const tableNames = [
  "profiles", "budgets", "categories", "budget_items", "assets",
  "asset_categories", "asset_value_history", "debts", "reports",
  "net_worth_snapshots", "activity_logs", "merchant_rules", "sms_transactions",
  "sms_blocklist", "feedback", "id_map", "sync_meta", "sync_queue",
  "notifications",
];

const db: Record<string, ReturnType<typeof makeTable>> & {
  table?: (n: string) => ReturnType<typeof makeTable>;
} = {};
for (const n of tableNames) db[n] = makeTable(n);
db.table = (n: string) => db[n];

vi.mock("./index", () => ({ getDB: () => db }));

/** Resolves only when the test says so — the "slow network" seam. */
let releaseFetch: (() => void) | null = null;
/** Counts the auth round trip we are trying NOT to make. */
let getUserCalls = 0;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "user-1" } } },
      }),
      getUser: async () => {
        getUserCalls++;
        return { data: { user: { id: "user-1" } } };
      },
    },
    from: () => ({
      // A pull now issues TWO calls per full-payload table: the row delta and
      // the id-only delete sweep. Only the row fetch is gated on the test.
      select: (columns: string) => ({
        eq: () =>
          columns === "id"
            ? Promise.resolve({ data: [{ id: "row-1" }] })
            : new Promise((resolve) => {
                releaseFetch = () =>
                  resolve({ data: [{ id: "row-1", user_id: "user-1" }] });
              }),
      }),
    }),
  }),
}));

const { forceRefreshTable, clearDB } = await import("./hydrate");

describe("hydrate wipe-generation guard", () => {
  beforeEach(() => {
    for (const k of Object.keys(written)) delete written[k];
    cleared.length = 0;
    releaseFetch = null;
    getUserCalls = 0;
  });

  it("writes the payload normally when no wipe happened", async () => {
    const pull = forceRefreshTable("budgets");
    await vi.waitFor(() => expect(releaseFetch).toBeTypeOf("function"));
    releaseFetch!();
    await pull;

    expect(written.budgets).toHaveLength(1);
    // The refresh path reads the session locally — no /auth/v1/user round trip.
    expect(getUserCalls).toBe(0);
  });

  it("drops a payload that lands after clearDB()", async () => {
    const pull = forceRefreshTable("budgets");
    await vi.waitFor(() => expect(releaseFetch).toBeTypeOf("function"));

    // Sign-out happens while the request is in flight.
    await clearDB();
    releaseFetch!();
    await pull;

    expect(cleared).toContain("budgets");
    expect(written.budgets).toBeUndefined();
  });
});
