"use client";

import Link from "next/link";
import { Heart, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CrownBadge } from "@/components/ui/CrownBadge";
import { useIsFoundingMember } from "@/lib/hooks/useFoundingMember";

/**
 * Profile entry for the support page. Deliberately quiet — AlloCat is free, so
 * this is a doorway to an explanation, not a sales pitch.
 */
export default function SupportCard() {
  const isMember = useIsFoundingMember();

  return (
    <>
      <p className="t-label text-muted-foreground mt-1 ml-1">AlloCat</p>

      <Link href="/support" className="block active:scale-[0.99] transition-transform">
        <Card compact className="flex items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-[11px] ${
              isMember ? "bg-accent/15" : "bg-tile text-muted-foreground"
            }`}
          >
            {isMember ? <CrownBadge size={26} /> : <Heart size={18} strokeWidth={1.7} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-bold text-foreground">
              {isMember ? "You're a founding member" : "Why AlloCat is free"}
            </div>
            <div className="text-[10.5px] font-medium text-muted-foreground mt-0.5">
              {isMember
                ? "Founding pricing locked for Premium"
                : "Free today — and what's coming next"}
            </div>
          </div>
          <ChevronRight size={16} strokeWidth={2} className="text-muted-foreground" />
        </Card>
      </Link>
    </>
  );
}
