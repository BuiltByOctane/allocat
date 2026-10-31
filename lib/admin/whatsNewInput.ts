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
