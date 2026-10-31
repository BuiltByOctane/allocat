import { describe, expect, it } from "vitest";
import {
  excerpt,
  inboxId,
  isUnseen,
  normalizeTags,
  whatsNewPushUrl,
} from "./format";

describe("normalizeTags", () => {
  it("keeps allowed, dedupes, preserves canonical order", () => {
    expect(normalizeTags(["fixed", "new", "bogus", "new"])).toEqual(["new", "fixed"]);
  });
  it("returns [] for non-arrays", () => {
    expect(normalizeTags(null)).toEqual([]);
  });
});

describe("excerpt", () => {
  it("strips markdown from first paragraph body", () => {
    expect(excerpt("## Split\n\n**Split** a spend into [many](/x) parts.\n\nMore")).toBe(
      "Split a spend into many parts.",
    );
  });
  it("strips list markers", () => {
    expect(excerpt("- one\n- two")).toBe("one");
  });
  it("truncates with ellipsis", () => {
    const out = excerpt("a".repeat(200), 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith("…")).toBe(true);
  });
  it("handles empty", () => {
    expect(excerpt("")).toBe("");
  });
});

describe("isUnseen", () => {
  const t = "2026-10-31T00:00:00Z";
  it("false without a latest entry", () => expect(isUnseen(undefined, null)).toBe(false));
  it("true when never seen", () => expect(isUnseen(t, null)).toBe(true));
  it("false when seen at same time", () => expect(isUnseen(t, t)).toBe(false));
  it("true when newer published", () => expect(isUnseen("2026-11-01T00:00:00Z", t)).toBe(true));
});

describe("urls", () => {
  it("builds push url and inbox id", () => {
    expect(whatsNewPushUrl("abc")).toBe("/whats-new?e=abc");
    expect(inboxId("abc")).toBe("whats-new:abc");
  });
});
