import { describe, it, expect } from "vitest";
import { clearAccountLocalStorage, ACCOUNT_SCOPED_LS_KEYS } from "./clearSession";

function makeStorage(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  return {
    removeItem: (k: string) => void store.delete(k),
    keys: () => [...store.keys()],
  };
}

describe("clearAccountLocalStorage", () => {
  it("removes every account-scoped key", () => {
    const initial = Object.fromEntries(ACCOUNT_SCOPED_LS_KEYS.map((k) => [k, "x"]));
    const storage = makeStorage(initial);
    clearAccountLocalStorage(storage);
    expect(storage.keys()).toEqual([]);
  });

  it("preserves device-level keys", () => {
    const storage = makeStorage({
      "allocat-device-id": "dev-1",
      "allocat-accent": "lime",
      "pwa-install-dismissed": "1",
      "allocat-tour-state": "{}",
    });
    clearAccountLocalStorage(storage);
    expect(storage.keys().sort()).toEqual(
      ["allocat-accent", "allocat-device-id", "pwa-install-dismissed"].sort()
    );
  });
});
