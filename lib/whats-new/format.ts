import { WHATS_NEW_TAGS, type WhatsNewTag } from "./types";

export const WHATS_NEW_URL = "/whats-new";

export function whatsNewPushUrl(id: string): string {
  return `${WHATS_NEW_URL}?e=${id}`;
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
  const first = pick.split("\n")[0];
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
