import { describe, it, expect } from "vitest";
import {
  OVERSPEND_SYSTEM,
  buildOverspendPrompt,
  parseOverspendResponse,
  type OverspendDerived,
} from "./overspendPrompt";

const d: OverspendDerived = {
  itemName: "Groceries",
  amount: 500,
  count: 2,
  tier: 2,
  currency: "INR",
  over: 250,
};

describe("OVERSPEND_SYSTEM", () => {
  it("forbids em-dash explicitly", () => {
    expect(OVERSPEND_SYSTEM.toLowerCase()).toMatch(/em-?dash/);
  });
});

describe("buildOverspendPrompt", () => {
  it("includes only derived fields", () => {
    const p = buildOverspendPrompt(d);
    expect(p).toContain("Groceries");
    expect(p).toMatch(/250/);
  });
  it("never leaks raw-SMS fields", () => {
    const p = buildOverspendPrompt({ ...d, itemName: "Groceries" }).toLowerCase();
    expect(p).not.toContain("sender");
    expect(p).not.toContain("sms body");
    expect(p).not.toContain("merchant");
  });
});

// parseOverspendResponse receives the OpenRouter ENVELOPE (res.json()), i.e.
// { choices: [{ message: { content: "<json string>" } }] } — same as parseInsightResponse.
const envelope = (obj: unknown) => ({
  choices: [{ message: { content: JSON.stringify(obj) } }],
});

describe("parseOverspendResponse", () => {
  it("returns title/body from a valid envelope", () => {
    expect(parseOverspendResponse(envelope({ title: "T", body: "B" }))).toEqual({
      title: "T",
      body: "B",
    });
  });
  it("returns null for malformed/empty/non-envelope", () => {
    expect(parseOverspendResponse(null)).toBeNull();
    expect(parseOverspendResponse("nope")).toBeNull();
    expect(parseOverspendResponse({ choices: [] })).toBeNull();
    expect(parseOverspendResponse(envelope({}))).toBeNull();
    expect(parseOverspendResponse(envelope({ title: "only title" }))).toBeNull();
  });
});
