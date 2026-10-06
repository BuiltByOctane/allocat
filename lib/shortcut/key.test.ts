import { describe, it, expect } from "vitest";
import {
  generateShortcutKey,
  hashShortcutKey,
  displayPrefix,
  parseShortcutBearer,
  SHORTCUT_KEY_PLACEHOLDER,
} from "./key";

describe("shortcut keys", () => {
  it("generates unique alc_-prefixed keys", () => {
    const a = generateShortcutKey();
    const b = generateShortcutKey();
    expect(a).toMatch(/^alc_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("hashes deterministically and never returns the key", () => {
    const k = generateShortcutKey();
    expect(hashShortcutKey(k)).toBe(hashShortcutKey(k));
    expect(hashShortcutKey(k)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShortcutKey(k)).not.toContain(k);
  });

  it("display prefix is short", () => {
    expect(displayPrefix("alc_abcdefghijk")).toBe("alc_abcd");
  });
});

describe("parseShortcutBearer", () => {
  const key = generateShortcutKey();

  it("reads a bearer key", () => {
    expect(parseShortcutBearer(`Bearer ${key}`)).toEqual({ kind: "key", key });
  });

  it("forgives whitespace from a hand paste", () => {
    expect(parseShortcutBearer(`Bearer   ${key}\n`)).toEqual({ kind: "key", key });
  });

  it("accepts a bare key without the Bearer word", () => {
    expect(parseShortcutBearer(key)).toEqual({ kind: "key", key });
  });

  it("flags missing and placeholder separately", () => {
    expect(parseShortcutBearer(null).kind).toBe("missing");
    expect(parseShortcutBearer("Bearer ").kind).toBe("missing");
    expect(parseShortcutBearer(`Bearer ${SHORTCUT_KEY_PLACEHOLDER}`).kind).toBe("placeholder");
  });

  it("rejects anything that is not an alc_ key", () => {
    expect(parseShortcutBearer("Bearer abc").kind).toBe("malformed");
    expect(parseShortcutBearer(`Bearer ${key} extra`).kind).toBe("malformed");
    expect(parseShortcutBearer(`Bearer alc_${"x".repeat(200)}`).kind).toBe("malformed");
  });
});
