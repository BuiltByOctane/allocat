import { describe, expect, it } from "vitest";
import {
  bucketPathFromUrl,
  checkImageUpload,
  detectImageType,
  validateEntryInput,
  validateNotifyInput,
} from "./whatsNewInput";

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

const bytes = (...xs: number[]) => new Uint8Array([...xs, ...new Array(16).fill(0)]);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const GIF = bytes(...Array.from("GIF89a", (c) => c.charCodeAt(0)));
const WEBP = bytes(...Array.from("RIFF\0\0\0\0WEBP", (c) => c.charCodeAt(0)));
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

describe("detectImageType", () => {
  it("recognises the four allowlisted formats by magic bytes", () => {
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(JPEG)).toBe("image/jpeg");
    expect(detectImageType(GIF)).toBe("image/gif");
    expect(detectImageType(WEBP)).toBe("image/webp");
  });
  it("returns null for svg, html, RIFF-non-webp and empty input", () => {
    expect(detectImageType(SVG)).toBeNull();
    expect(detectImageType(HTML)).toBeNull();
    expect(detectImageType(bytes(...Array.from("RIFF\0\0\0\0WAVE", (c) => c.charCodeAt(0))))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe("checkImageUpload", () => {
  it("accepts a matching type and takes the extension from the allowlist", () => {
    expect(checkImageUpload("image/jpeg", 100, JPEG)).toEqual({ ok: true, mime: "image/jpeg", ext: "jpg" });
  });
  it("rejects svg even when declared as an image", () => {
    expect(checkImageUpload("image/svg+xml", 100, SVG).ok).toBe(false);
  });
  it("rejects html bytes declared as png", () => {
    expect(checkImageUpload("image/png", 100, HTML).ok).toBe(false);
  });
  it("rejects a declared/sniffed mismatch", () => {
    expect(checkImageUpload("image/png", 100, JPEG).ok).toBe(false);
  });
  it("rejects files over 2 MB and empty files", () => {
    expect(checkImageUpload("image/png", 2 * 1024 * 1024 + 1, PNG).ok).toBe(false);
    expect(checkImageUpload("image/png", 2 * 1024 * 1024, PNG).ok).toBe(true);
    expect(checkImageUpload("image/png", 0, PNG).ok).toBe(false);
  });
});
