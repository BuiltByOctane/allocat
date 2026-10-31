import { WHATS_NEW_TAGS, type WhatsNewTag } from "./types";

export const WHATS_NEW_URL = "/whats-new";

export function whatsNewPushUrl(id: string): string {
  return `${WHATS_NEW_URL}?e=${id}`;
}

/** The entry id carried by a `/whats-new?e=<id>` push url, else undefined. */
export function whatsNewIdFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url, "http://local");
    if (u.pathname !== WHATS_NEW_URL) return undefined;
    return u.searchParams.get("e") || undefined;
  } catch {
    return undefined;
  }
}

export function inboxId(id: string): string {
  return `whats-new:${id}`;
}

export function normalizeTags(input: unknown): WhatsNewTag[] {
  if (!Array.isArray(input)) return [];
  return WHATS_NEW_TAGS.filter((t) => input.includes(t));
}

export function excerpt(md: string, max = 120): string {
  const paras = md.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  // Prefer the first non-heading paragraph; a heading-only body falls back to it.
  const pick = paras.find((p) => !/^#{1,6}\s/.test(p)) ?? paras[0];
  if (!pick) return "";
  // A list yields its first item; prose is a soft-wrapped paragraph, so join lines.
  const lines = pick.split("\n");
  const first = /^\s*([-*+]|\d+\.)\s/.test(lines[0]) ? lines[0] : lines.join(" ");
  const text = first
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s*)/, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function isUnseen(
  latestPublishedAt: string | undefined,
  seenAt: string | null,
): boolean {
  if (!latestPublishedAt) return false;
  if (!seenAt) return true;
  return Date.parse(latestPublishedAt) > Date.parse(seenAt);
}

/** Push titles in Allo the Cat's voice; a fix-only entry gets its own set. */
export const FEATURE_PUSH_TITLES = [
  "Psst… Allo brought you something new 🐾",
  "Meow! A fresh feature just landed 🐱",
  "Allo dragged in something new. Come see 🐾",
  "New trick unlocked 😼",
] as const;

export const FIX_PUSH_TITLES = [
  "Allo caught a bug 🐾",
  "Pounced on a pesky bug 😼",
  "Hairball cleared. Things run smoother now 🐱",
] as const;

/** Only `fixed` (no new/improved) counts as a fix; untagged reads as a feature. */
export function pushTitles(tags: WhatsNewTag[]): readonly string[] {
  const fixOnly = tags.includes("fixed") && !tags.includes("new") && !tags.includes("improved");
  return fixOnly ? FIX_PUSH_TITLES : FEATURE_PUSH_TITLES;
}

/** Prefilled push: a cat line as the title, the entry's title as the body. */
export function pushDefaults(
  entry: { title: string; tags: WhatsNewTag[] },
  pick = 0,
): { title: string; body: string } {
  const titles = pushTitles(entry.tags);
  return { title: titles[pick % titles.length], body: entry.title };
}
