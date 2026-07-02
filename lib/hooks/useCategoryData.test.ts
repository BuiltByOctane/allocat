import { describe, it, expect, vi } from "vitest";

/**
 * Blank category detail page after creation.
 *
 * `handleCreateCategory` navigates to `/budget/<temp_id>` using the optimistic id
 * returned by the INSERT. Once SyncEngine flushes, `replaceIDBRecord` DELETES the
 * temp `categories` row and re-inserts it under the real server id, recording the
 * mapping only in `id_map`. `getCategoryFromIDB(temp_id)` then missed IDB and the
 * server (which never had the temp id) → `null` → the detail page rendered blank.
 *
 * getCategoryFromIDB now resolves a dead temp id through `id_map` and keys all
 * downstream lookups (items FK, sibling categories) off the durable real id.
 *
 * IDB test infra (fake-indexeddb / jsdom) is NOT available here, so we inject an
 * in-memory Dexie-shaped stub modelling only the surface this helper touches.
 */

interface Row {
  id: string;
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
            async toArray() {
              return rows.filter((r) => r[field] === value);
            },
          };
        },
      };
    },
    async get(id: string) {
      return rows.find((r) => r.id === id);
    },
  };
}

const categories = makeTable([
  // Real, post-swap category row (temp row was deleted by replaceIDBRecord).
  { id: "real_1", budget_id: "b1", name: "Groceries", allocated_amount: 500 },
  { id: "real_2", budget_id: "b1", name: "Transport", allocated_amount: 200 },
]);
const budgets = makeTable([{ id: "b1", total_budget: 1000, month: 7, year: 2026 }]);
const budget_items = makeTable([
  { id: "item_1", category_id: "real_1", name: "Milk", planned_amount: 50, actual_amount: 40, is_completed: false, notes: null },
]);
const id_map = makeTable([{ id: "temp_abc", realId: "real_1", tempId: "temp_abc", table: "categories" }]);

const dbStub = { categories, budgets, budget_items, id_map };

vi.mock("@/lib/db", () => ({ getDB: () => dbStub }));

// Server fallback must never be needed once id_map resolves — make it throw so a
// regression (falling through to the network with a temp id) fails loudly.
vi.mock("@/lib/actions/budget", () => ({
  getCategoryData: () => {
    throw new Error("server fallback should not run for a resolvable temp id");
  },
}));

const { getCategoryFromIDB } = await import("./useCategoryData");

describe("getCategoryFromIDB", () => {
  it("resolves a swapped temp_ id via id_map (the blank-page bug)", async () => {
    const data = await getCategoryFromIDB("temp_abc");
    expect(data).not.toBeNull();
    expect(data?.id).toBe("real_1");
    expect(data?.name).toBe("Groceries");
  });

  it("loads item FKs and otherAllocated keyed off the real id, not the temp id", async () => {
    const data = await getCategoryFromIDB("temp_abc");
    // Items are stored under category_id=real_1; a temp-keyed query would miss them.
    expect(data?.items.map((i) => i.id)).toEqual(["item_1"]);
    // otherAllocated excludes real_1 (500) and sums the sibling (200).
    expect(data?.otherAllocated).toBe(200);
  });

  it("still resolves a plain real id directly", async () => {
    const data = await getCategoryFromIDB("real_2");
    expect(data?.id).toBe("real_2");
    expect(data?.name).toBe("Transport");
  });

  it("returns null for an id that is neither a row nor a mapping", async () => {
    expect(await getCategoryFromIDB("temp_missing")).toBeNull();
  });
});
