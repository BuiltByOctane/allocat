import { describe, it, expect } from "vitest";
import { parseFlags, DEFAULT_FLAGS } from "./flags";

describe("parseFlags", () => {
  it("returns defaults for junk input", () => {
    expect(parseFlags(null)).toEqual(DEFAULT_FLAGS);
    expect(parseFlags("nope")).toEqual(DEFAULT_FLAGS);
    expect(parseFlags(42)).toEqual(DEFAULT_FLAGS);
    expect(parseFlags({})).toEqual(DEFAULT_FLAGS);
  });

  it("applies known booleans", () => {
    expect(parseFlags({ ai_enabled: false }).ai_enabled).toBe(false);
    expect(parseFlags({ sms_enabled: false }).sms_enabled).toBe(false);
  });

  it("ignores wrong types rather than darkening a feature", () => {
    expect(parseFlags({ ai_enabled: "false" }).ai_enabled).toBe(true);
    expect(parseFlags({ ai_enabled: 0 }).ai_enabled).toBe(true);
  });

  it("takes a positive integer quota and rejects anything else", () => {
    expect(parseFlags({ daily_ai_messages: 50 }).daily_ai_messages).toBe(50);
    expect(parseFlags({ daily_ai_messages: 12.7 }).daily_ai_messages).toBe(12);
    expect(parseFlags({ daily_ai_messages: 0 }).daily_ai_messages).toBe(
      DEFAULT_FLAGS.daily_ai_messages,
    );
    expect(parseFlags({ daily_ai_messages: -5 }).daily_ai_messages).toBe(
      DEFAULT_FLAGS.daily_ai_messages,
    );
  });

  it("drops unknown keys", () => {
    expect(parseFlags({ evil: true })).toEqual(DEFAULT_FLAGS);
  });
});
