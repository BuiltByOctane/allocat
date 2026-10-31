import { describe, expect, it } from "vitest";
import { bucketPathFromUrl, validateEntryInput, validateNotifyInput } from "./whatsNewInput";

const base = { title: "Budget cycles", body_md: "Pick your payday.", tags: ["new"], image_url: null };

describe("validateEntryInput", () => {
  it("rejects an empty title", () => {
    const r = validateEntryInput({ ...base, title: "   " });
    expect(r.ok).toBe(false);
  });

  it("rejects a 121-char title", () => {
    expect(validateEntryInput({ ...base, title: "a".repeat(121) }).ok).toBe(false);
    expect(validateEntryInput({ ...base, title: "a".repeat(120) }).ok).toBe(true);
  });

  it("rejects a body over 10 000 chars", () => {
    expect(validateEntryInput({ ...base, body_md: "x".repeat(10_001) }).ok).toBe(false);
  });

  it("drops unknown tags", () => {
    const r = validateEntryInput({ ...base, tags: ["new", "x"] });
    expect(r).toEqual({ ok: true, value: { ...base, tags: ["new"] } });
  });

  it("rejects a non-https image url", () => {
    expect(validateEntryInput({ ...base, image_url: "javascript:x" }).ok).toBe(false);
    expect(validateEntryInput({ ...base, image_url: "http://a.test/x.png" }).ok).toBe(false);
  });

  it("accepts https image url and treats empty as null", () => {
    const r = validateEntryInput({ ...base, image_url: "https://a.test/x.png" });
    expect(r.ok && r.value.image_url).toBe("https://a.test/x.png");
    const e = validateEntryInput({ ...base, image_url: "" });
    expect(e.ok && e.value.image_url).toBeNull();
  });

  it("trims the title on valid input", () => {
    const r = validateEntryInput({ ...base, title: "  Hello  " });
    expect(r.ok && r.value.title).toBe("Hello");
  });
});

describe("validateNotifyInput", () => {
  it("enforces 1–80 title and 1–200 body", () => {
    expect(validateNotifyInput({ title: "", body: "b" }).ok).toBe(false);
    expect(validateNotifyInput({ title: "t".repeat(81), body: "b" }).ok).toBe(false);
    expect(validateNotifyInput({ title: "t", body: "b".repeat(201) }).ok).toBe(false);
    expect(validateNotifyInput({ title: " t ", body: " b " })).toEqual({ ok: true, value: { title: "t", body: "b" } });
  });
});

describe("bucketPathFromUrl", () => {
  it("extracts the object path for a whats-new public url", () => {
    expect(bucketPathFromUrl("https://x.supabase.co/storage/v1/object/public/whats-new/abc.png")).toBe("abc.png");
    expect(bucketPathFromUrl("https://cdn.test/abc.png")).toBeNull();
    expect(bucketPathFromUrl(null)).toBeNull();
  });
});
