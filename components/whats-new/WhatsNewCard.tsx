"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { ChevronRight, Sparkles, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { TagPill } from "@/components/whats-new/TagPill";
import { useWhatsNewUnseen } from "@/lib/hooks/useWhatsNew";
import { WHATS_NEW_URL } from "@/lib/whats-new/format";
import { markSeen } from "@/lib/whats-new/local";

/**
 * Dashboard announcement for the newest unseen changelog entry. Hidden when
 * there is nothing unseen, when the table is empty, or when localStorage is
 * unavailable (the hook reports `unseen: false` then).
 */
export function WhatsNewCard() {
  const { unseen, latest } = useWhatsNewUnseen();
  if (!unseen || !latest) return null;

  const dismiss = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    markSeen(latest.published_at);
  };

  const tag = latest.tags[0];

  return (
    <Link href={WHATS_NEW_URL} className="block active:scale-[0.99] transition-transform">
      <Card compact className="relative overflow-hidden flex items-center gap-3 border border-accent/60">
        {/* Tint layered over Card's own bg-card (two bg utilities would race on CSS order). */}
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-accent/10" />
        <div className="relative flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-accent text-accent-ink">
          <Sparkles size={19} strokeWidth={2} />
        </div>
        <div className="relative flex-1 min-w-0">
          <div className="t-label text-muted-foreground">New in AlloCat</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="truncate text-[14px] font-bold text-foreground">{latest.title}</span>
            {tag && <TagPill tag={tag} />}
          </div>
        </div>
        <ChevronRight size={16} strokeWidth={2} className="relative shrink-0 text-muted-foreground" />
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="relative flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground active:scale-90 transition-transform"
        >
          <X size={14} strokeWidth={2.2} />
        </button>
      </Card>
    </Link>
  );
}

export default WhatsNewCard;
