export type WhatsNewTag = "new" | "improved" | "fixed";

export const WHATS_NEW_TAGS: readonly WhatsNewTag[] = ["new", "improved", "fixed"];

export interface WhatsNewEntry {
  id: string;
  title: string;
  body_md: string;
  tags: WhatsNewTag[];
  image_url: string | null;
  published_at: string;
  notified_at: string | null;
  updated_at: string;
}
