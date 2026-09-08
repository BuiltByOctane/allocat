import { describe, it, expect } from "vitest";
import { isTransientSyncError, transientBackoffMs } from "./errors";

describe("isTransientSyncError", () => {
  it("treats offline as transient regardless of error", () => {
    expect(isTransientSyncError(new Error("Unauthorized"), false)).toBe(true);
  });
  it("treats fetch/network failures as transient", () => {
    expect(isTransientSyncError(new TypeError("Failed to fetch"), true)).toBe(true);
    expect(isTransientSyncError(new Error("fetch failed"), true)).toBe(true);
    expect(isTransientSyncError(new Error("Load failed"), true)).toBe(true);
    expect(isTransientSyncError(new Error("An unexpected response was received from the server."), true)).toBe(true);
    expect(isTransientSyncError(new Error("Request timed out"), true)).toBe(true);
    expect(isTransientSyncError(new Error("503 Service Unavailable"), true)).toBe(true);
  });
  it("treats validation / auth errors as permanent", () => {
    expect(isTransientSyncError(new Error("Items exceed the category budget of ₹500 by ₹50."), true)).toBe(false);
    expect(isTransientSyncError(new Error("Unauthorized"), true)).toBe(false);
    expect(isTransientSyncError(new Error("Item not found"), true)).toBe(false);
    expect(isTransientSyncError("dependency never synced", true)).toBe(false);
  });
});

describe("transientBackoffMs", () => {
  it("doubles then caps at 5 minutes", () => {
    expect(transientBackoffMs(1)).toBe(2_000);
    expect(transientBackoffMs(3)).toBe(8_000);
    expect(transientBackoffMs(20)).toBe(300_000);
  });
});
