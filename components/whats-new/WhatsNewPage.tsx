"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Markdown } from "@/components/whats-new/Markdown";
import { TagPill } from "@/components/whats-new/TagPill";
import { useWhatsNew } from "@/lib/hooks/useWhatsNew";
import { markSeen } from "@/lib/whats-new/local";
import type { WhatsNewEntry } from "@/lib/whats-new/types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function EntryCard({ entry, highlight }: { entry: WhatsNewEntry; highlight: boolean }) {
  return (
    <Card
      id={`whats-new-${entry.id}`}
      className={`scroll-mt-4 flex flex-col gap-3 ${highlight ? "ring-2 ring-accent" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {entry.tags.map((t) => (
          <TagPill key={t} tag={t} />
        ))}
        <span className="ml-auto text-[10.5px] font-semibold text-muted-foreground tabular-nums">
          {formatDate(entry.published_at)}
        </span>
      </div>
      <h2 className="font-display text-[19px] font-bold leading-tight tracking-[-0.02em] text-foreground">
        {entry.title}
      </h2>
      {entry.image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- remote changelog image, unknown dimensions
        <img
          src={entry.image_url}
          alt=""
          loading="lazy"
          className="w-full max-w-full rounded-[18px] border border-border"
        />
      )}
      <Markdown source={entry.body_md} />
    </Card>
  );
}

export default function WhatsNewPage() {
  const { data, isLoading } = useWhatsNew();
  const entries = data ?? [];
  const latestAt = entries[0]?.published_at;
  const target = useSearchParams().get("e") ?? undefined;
  const scrolled = useRef(false);

  // Opening the page clears the unseen dot/card — but only once real entries exist.
  useEffect(() => {
    if (latestAt) markSeen(latestAt);
  }, [latestAt]);

  // A push tap lands on `?e=<id>`: bring that entry into view once it is rendered.
  const hasTarget = !!target && entries.some((e) => e.id === target);
  useEffect(() => {
    if (!hasTarget || scrolled.current) return;
    scrolled.current = true;
    document
      .getElementById(`whats-new-${target}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hasTarget, target]);

  return (
    <div className="px-4 pt-4 pb-8 flex flex-col gap-3">
      <div className="flex items-center gap-3 px-1 pt-1">
        <Link
          href="/profile"
          aria-label="Back"
          className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-foreground"
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground">
            What&apos;s new
          </h1>
          <p className="text-[11px] font-medium text-muted-foreground mt-1">
            Recent updates to AlloCat
          </p>
        </div>
      </div>

      {isLoading && entries.length === 0 && (
        <div className="space-y-3 pt-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-[160px] bg-muted/50 animate-pulse rounded-card" />
          ))}
        </div>
      )}

      {!isLoading && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex size-12 items-center justify-center rounded-[14px] bg-tile text-muted-foreground mb-4">
            <Sparkles size={24} strokeWidth={1.7} />
          </div>
          <p className="text-[13.5px] font-bold text-foreground">Nothing new yet.</p>
        </div>
      )}

      {entries.length > 0 && (
        <div className="flex flex-col gap-3 pt-1">
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} highlight={e.id === target} />
          ))}
        </div>
      )}
    </div>
  );
}
