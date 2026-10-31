import { describe, expect, it } from "vitest";
import {
  excerpt,
  FEATURE_PUSH_TITLES,
  FIX_PUSH_TITLES,
  inboxId,
  isUnseen,
  normalizeTags,
  pushDefaults,
  whatsNewIdFromUrl,
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
  it("joins soft-wrapped lines", () => {
    expect(excerpt("first line\nsecond line")).toBe("first line second line");
  });
  it("falls back to heading when only a heading exists", () => {
    expect(excerpt("## Only heading")).toBe("Only heading");
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

describe("whatsNewIdFromUrl", () => {
  it("returns the entry id from a whats-new push url", () => {
    expect(whatsNewIdFromUrl("/whats-new?e=abc")).toBe("abc");
  });
  it("ignores other paths", () => {
    expect(whatsNewIdFromUrl("/sms")).toBeUndefined();
    expect(whatsNewIdFromUrl("/sms?e=abc")).toBeUndefined();
  });
  it("handles missing url or param", () => {
    expect(whatsNewIdFromUrl(undefined)).toBeUndefined();
    expect(whatsNewIdFromUrl("/whats-new")).toBeUndefined();
  });
});

describe("pushDefaults", () => {
  it("uses the entry title as the body", () => {
    expect(pushDefaults({ title: "Split one spend", tags: ["new"] }).body).toBe("Split one spend");
  });
  it("picks a feature line for new/improved and untagged entries", () => {
    expect(pushDefaults({ title: "x", tags: ["improved"] }).title).toBe(FEATURE_PUSH_TITLES[0]);
    expect(pushDefaults({ title: "x", tags: [] }).title).toBe(FEATURE_PUSH_TITLES[0]);
    expect(pushDefaults({ title: "x", tags: ["new", "fixed"] }).title).toBe(FEATURE_PUSH_TITLES[0]);
  });
  it("picks a fix line for fix-only entries", () => {
    expect(pushDefaults({ title: "x", tags: ["fixed"] }).title).toBe(FIX_PUSH_TITLES[0]);
  });
  it("cycles through the lines", () => {
    expect(pushDefaults({ title: "x", tags: ["fixed"] }, FIX_PUSH_TITLES.length + 1).title).toBe(
      FIX_PUSH_TITLES[1],
    );
  });
  it("keeps every line within the 80-char push title limit", () => {
    for (const t of [...FEATURE_PUSH_TITLES, ...FIX_PUSH_TITLES]) expect(t.length).toBeLessThanOrEqual(80);
  });
});
