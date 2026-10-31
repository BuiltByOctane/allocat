import type { WhatsNewTag } from "@/lib/whats-new/types";

const LABEL: Record<WhatsNewTag, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
};

const TONE: Record<WhatsNewTag, string> = {
  new: "bg-accent text-accent-ink",
  improved: "bg-info/15 text-info",
  fixed: "bg-tile text-muted-foreground",
};

/** Small changelog tag pill: New = accent, Improved = muted blue, Fixed = muted. */
export function TagPill({ tag }: { tag: WhatsNewTag }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold leading-none whitespace-nowrap ${TONE[tag]}`}
    >
      {LABEL[tag]}
    </span>
  );
}
