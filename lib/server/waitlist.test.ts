import { describe, expect, it } from "vitest";
import { parseWaitlistInput } from "./waitlist";

describe("parseWaitlistInput", () => {
  it("accepts a valid signup and normalises the email", () => {
    const r = parseWaitlistInput({
      email: "  Priya@Example.COM ",
      preference: "native",
      source: "cta",
      platform: "ios",
    });
    expect(r).toEqual({
      ok: true,
      spam: false,
      row: { email: "priya@example.com", preference: "native", source: "cta", platform: "ios" },
    });
  });

  it("nulls unknown source and platform instead of storing them", () => {
    const r = parseWaitlistInput({ email: "a@b.co", preference: "web", source: "x", platform: 42 });
    expect(r).toMatchObject({ ok: true, row: { source: null, platform: null } });
  });

  it.each(["", "nope", "a@b", "a b@c.de", `${"a".repeat(250)}@b.co`, null])(
    "rejects invalid email %p",
    (email) => {
      expect(parseWaitlistInput({ email, preference: "either" })).toEqual({
        ok: false,
        error: "invalid_email",
      });
    },
  );

  it("rejects a missing or unknown preference", () => {
    expect(parseWaitlistInput({ email: "a@b.co" })).toEqual({ ok: false, error: "invalid_preference" });
    expect(parseWaitlistInput({ email: "a@b.co", preference: "android" })).toEqual({
      ok: false,
      error: "invalid_preference",
    });
  });

  it("flags the honeypot as spam before validating anything", () => {
    expect(parseWaitlistInput({ website: "http://spam", email: "bad" })).toEqual({ ok: true, spam: true });
  });
});
