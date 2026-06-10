import { describe, it, expect } from "vitest";
import { reconcileInsertReplacement } from "./reconcile";

describe("reconcileInsertReplacement", () => {
  it("uses the server record + real id for a plain insert", () => {
    const local = { id: "temp_1", status: "pending", name: "x" };
    const server = { id: "temp_1", status: "pending", name: "x", extra: 1 };
    const out = reconcileInsertReplacement("budget_items", local, server, "real_1");
    expect(out).toEqual({ id: "real_1", status: "pending", name: "x", extra: 1 });
  });

  it("preserves a local categorize that the server insert response predates", () => {
    // SMS ingested (pending, temp) then allocated before INSERT synced.
    const local = {
      id: "temp_1",
      status: "categorized",
      budget_item_id: "item_9",
    };
    const server = { id: "temp_1", status: "pending", budget_item_id: null };
    const out = reconcileInsertReplacement(
      "sms_transactions",
      local,
      server,
      "real_1"
    );
    expect(out.id).toBe("real_1");
    expect(out.status).toBe("categorized"); // not reverted to "pending"
    expect(out.budget_item_id).toBe("item_9");
  });

  it("preserves a local ignore the same way", () => {
    const local = { id: "temp_1", status: "ignored" };
    const server = { id: "temp_1", status: "pending" };
    const out = reconcileInsertReplacement(
      "sms_transactions",
      local,
      server,
      "real_1"
    );
    expect(out.status).toBe("ignored");
  });

  it("lets the server win when the local sms row is still pending", () => {
    const local = { id: "temp_1", status: "pending", budget_item_id: null };
    const server = {
      id: "temp_1",
      status: "categorized",
      budget_item_id: "item_2",
    };
    const out = reconcileInsertReplacement(
      "sms_transactions",
      local,
      server,
      "real_1"
    );
    expect(out.status).toBe("categorized");
    expect(out.budget_item_id).toBe("item_2");
  });

  it("does not apply the sms carve-out to other tables", () => {
    const local = { id: "temp_1", status: "categorized" };
    const server = { id: "temp_1", status: "pending" };
    const out = reconcileInsertReplacement("budget_items", local, server, "real_1");
    expect(out.status).toBe("pending");
  });
});
