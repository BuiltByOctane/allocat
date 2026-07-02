import { describe, it, expect } from "vitest";
import { selectRowsToDelete, unionProtected } from "./hydrate";

/**
 * Delete-propagation + protected-id race fixes for the offline-first hydrate.
 *
 * `hydrateAllTables`/`forceRefreshTable` used to only `bulkPut` — a row deleted
 * on another device became a permanent ghost. `selectRowsToDelete` now drives
 * delete-reconciliation, and `unionProtected` closes the snapshot race where an
 * item drains between the fetch and the write. These pure helpers hold the
 * decision logic (the IDB layer isn't available under vitest here).
 */
describe("selectRowsToDelete", () => {
  const server = new Set(["a", "b"]);

  it("deletes local rows absent from the server payload (ghost rows)", () => {
    expect(selectRowsToDelete(["a", "b", "gone"], server, undefined)).toEqual([
      "gone",
    ]);
  });

  it("keeps rows still present on the server", () => {
    expect(selectRowsToDelete(["a", "b"], server, undefined)).toEqual([]);
  });

  it("never deletes un-synced local temp_ INSERT rows", () => {
    expect(
      selectRowsToDelete(["temp_123", "gone"], server, undefined),
    ).toEqual(["gone"]);
  });

  it("never deletes protected rows (in-flight local mutation)", () => {
    const protectedIds = new Set(["gone"]);
    expect(selectRowsToDelete(["gone", "also"], server, protectedIds)).toEqual([
      "also",
    ]);
  });

  it("deletes everything local when the server payload is empty", () => {
    expect(selectRowsToDelete(["a", "b"], new Set(), undefined)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("unionProtected", () => {
  it("merges per-table id sets from the pre- and post-fetch snapshots", () => {
    const pre = new Map([["budget_items", new Set(["x"])]]);
    const post = new Map([
      ["budget_items", new Set(["y"])],
      ["assets", new Set(["z"])],
    ]);
    const merged = unionProtected(pre, post);
    expect([...(merged.get("budget_items") ?? [])].sort()).toEqual(["x", "y"]);
    expect([...(merged.get("assets") ?? [])]).toEqual(["z"]);
  });

  it("an id protected only pre-fetch survives (covers the drain-during-fetch race)", () => {
    // Item was pending when the fetch was issued, drained to done before the
    // post-fetch snapshot — union keeps it protected so the stale server row
    // isn't written over the optimistic value.
    const pre = new Map([["budget_items", new Set(["draining"])]]);
    const post = new Map<string, Set<string>>();
    const merged = unionProtected(pre, post);
    const kept = merged.get("budget_items");
    const survives = selectRowsToDelete(
      ["draining"],
      new Set(),
      kept,
    );
    expect(survives).toEqual([]); // protected → not deleted
  });
});
