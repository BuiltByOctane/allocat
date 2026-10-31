import { normalizeTags } from "@/lib/whats-new/format";
import type { WhatsNewTag } from "@/lib/whats-new/types";

/**
 * Pure input checks for the admin "What's new" actions. Lives outside the
 * `"use server"` module so it can be unit-tested and stays non-callable.
 */

export interface EntryInput {
  title: string;
  body_md: string;
  tags: string[];
  image_url: string | null;
}

export interface EntryValue {
  title: string;
  body_md: string;
  tags: WhatsNewTag[];
  image_url: string | null;
}

export const TITLE_MAX = 120;
export const BODY_MAX = 10_000;
export const NOTIFY_TITLE_MAX = 80;
export const NOTIFY_BODY_MAX = 200;

type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateEntryInput(input: EntryInput): Validated<EntryValue> {
  const title = String(input?.title ?? "").trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (title.length > TITLE_MAX) return { ok: false, error: `Title must be ≤${TITLE_MAX} characters.` };

  const body_md = String(input?.body_md ?? "");
  if (body_md.length > BODY_MAX) return { ok: false, error: `Body must be ≤${BODY_MAX} characters.` };

  const raw = input?.image_url ? String(input.image_url).trim() : "";
  let image_url: string | null = null;
  if (raw) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      return { ok: false, error: "Image URL is not a valid URL." };
    }
    if (u.protocol !== "https:") return { ok: false, error: "Image URL must use https://." };
    image_url = raw;
  }

  return { ok: true, value: { title, body_md, tags: normalizeTags(input?.tags), image_url } };
}

export function validateNotifyInput(input: {
  title: string;
  body: string;
}): Validated<{ title: string; body: string }> {
  const title = String(input?.title ?? "").trim();
  const body = String(input?.body ?? "").trim();
  if (!title || title.length > NOTIFY_TITLE_MAX) {
    return { ok: false, error: `Push title must be 1–${NOTIFY_TITLE_MAX} characters.` };
  }
  if (!body || body.length > NOTIFY_BODY_MAX) {
    return { ok: false, error: `Push body must be 1–${NOTIFY_BODY_MAX} characters.` };
  }
  return { ok: true, value: { title, body } };
}

/** Object path inside the `whats-new` bucket for one of its public URLs, else null. */
export function bucketPathFromUrl(url: string | null | undefined, bucket = "whats-new"): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  const path = decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
  return path && !path.includes("..") ? path : null;
}

/** The only image types the `whats-new` bucket accepts (no SVG: it can carry script). */
export const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
export type ImageMime = keyof typeof IMAGE_TYPES;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Sniff the real image type from magic bytes; null when it is none of IMAGE_TYPES. */
export function detectImageType(b: Uint8Array): ImageMime | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, k) => b[i + k] === x);
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (b.length >= 6 && (at(0, 0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || at(0, 0x47, 0x49, 0x46, 0x38, 0x39, 0x61))) {
    return "image/gif";
  }
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/**
 * Accept an upload only when its declared type is allowlisted AND matches its
 * bytes. The stored extension and content type come from the allowlist, never
 * from the client's file name.
 */
export function checkImageUpload(
  declared: string,
  size: number,
  head: Uint8Array,
): { ok: true; mime: ImageMime; ext: string } | { ok: false; error: string } {
  if (size <= 0) return { ok: false, error: "No file." };
  if (!(declared in IMAGE_TYPES)) return { ok: false, error: "Only PNG, JPEG, WebP or GIF images." };
  if (size > MAX_IMAGE_BYTES) return { ok: false, error: "Image must be ≤ 2 MB." };
  const sniffed = detectImageType(head);
  if (sniffed !== declared) return { ok: false, error: "File contents do not match its image type." };
  return { ok: true, mime: sniffed, ext: IMAGE_TYPES[sniffed] };
}
