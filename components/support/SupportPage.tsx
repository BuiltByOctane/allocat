"use client";

import Link from "next/link";
import { ChevronLeft, Crown, Server, Sparkles, ShieldCheck, Store } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CrownBadge } from "@/components/ui/CrownBadge";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useAppFlags } from "@/lib/hooks/useAppFlags";
import { useProfile } from "@/lib/hooks/useProfile";
import { useClaimFounding, useIsFoundingMember } from "@/lib/hooks/useFoundingMember";
import { FOUNDING_CONFIRMATION, claimErrorCopy } from "@/components/founding/copy";

const COSTS = [
  {
    icon: Server,
    label: "Servers & database",
    detail: "Hosting, sync and backups for every account.",
  },
  {
    icon: Sparkles,
    label: "AlloCat AI",
    detail: "Every chat message costs real money to run.",
  },
  {
    icon: Store,
    label: "Play Store & domain",
    detail: "Developer account, signing, the allocat.xyz name.",
  },
];

function formatSince(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function SupportPage() {
  const isMember = useIsFoundingMember();
  const { data: profile } = useProfile();
  const since = formatSince(profile?.founding_member_since ?? null);
  const haptic = useHaptic();
  const flags = useAppFlags();
  const { state, claim } = useClaimFounding("support");
  const error = claimErrorCopy(state);

  const onClaim = () => {
    haptic.light();
    void claim();
  };

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 px-1 pt-1">
        <Link
          href="/profile"
          aria-label="Back"
          className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-foreground"
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </Link>
        <div>
          <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground">
            Why AlloCat is free
          </h1>
          <p className="text-[11px] font-medium text-muted-foreground mt-1">
            The whole story, honestly
          </p>
        </div>
      </div>

      {/* The story */}
      <div className="wordmark-watermark relative overflow-hidden rounded-card bg-accent p-[18px] text-[var(--accent-ink)]">
        <p className="font-display text-[20px] font-bold leading-tight tracking-[-0.02em]">
          Everything in AlloCat is free today. All of it.
        </p>
        <p className="text-[12.5px] font-medium leading-relaxed mt-2 opacity-85">
          No locked features, no &ldquo;upgrade to continue&rdquo;. I built
          AlloCat because I wanted a money app that didn&apos;t nag me. What you
          use now stays free — Premium, when it comes, adds new things on top
          instead of taking anything away.
        </p>
      </div>

      <Card className="flex flex-col gap-2.5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tile text-muted-foreground">
            <ShieldCheck size={18} strokeWidth={1.7} />
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold text-foreground">
              And it stays free the honest way
            </div>
            <p className="text-[11.5px] font-medium text-muted-foreground leading-relaxed mt-1">
              No ads. Your data is never sold or shared. Bank SMS is read on your
              device and only the extracted amount and merchant ever leave it.
              There is no version of AlloCat where that changes.
            </p>
          </div>
        </div>
        <Link
          href="/legal/privacy-policy"
          className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors ml-12"
        >
          Read the privacy policy
        </Link>
      </Card>

      {/* Running costs */}
      <p className="t-label text-muted-foreground mt-1 ml-1">What it costs to run</p>
      {COSTS.map(({ icon: Icon, label, detail }) => (
        <Card key={label} compact className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tile text-muted-foreground">
            <Icon size={18} strokeWidth={1.7} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-bold text-foreground">{label}</div>
            <div className="text-[10.5px] font-medium text-muted-foreground mt-0.5">
              {detail}
            </div>
          </div>
        </Card>
      ))}

      {/* Founding-member offer */}
      <p className="t-label text-muted-foreground mt-1 ml-1">Premium is coming</p>
      {isMember || state === "claimed" ? (
        <Card className="flex flex-col items-center text-center gap-1.5">
          <CrownBadge size={64} />
          <div className="font-display text-[19px] font-bold text-foreground leading-tight">
            You&apos;re a founding member
          </div>
          <p className="text-[12px] font-medium text-muted-foreground leading-relaxed">
            {state === "claimed"
              ? FOUNDING_CONFIRMATION
              : `${since ? `Claimed ${since}. ` : ""}We'll let you know as soon as Premium launches — your founding-member pricing is locked.`}
          </p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-accent/15 text-accent">
              <Crown size={18} strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-foreground">
                Exclusive founding-member pricing
              </div>
              <p className="text-[11.5px] font-medium text-muted-foreground leading-relaxed mt-1">
                Keeping AlloCat running costs real money, so a Premium tier will
                arrive eventually. Early users get exclusive founding-member
                pricing on it. Claiming is free, costs nothing now and changes
                nothing in your app — we&apos;ll just tell you when it&apos;s live.
              </p>
            </div>
          </div>

          {flags.founding_offer_open && state !== "closed" ? (
            <button
              type="button"
              onClick={onClaim}
              disabled={state === "claiming"}
              className="w-full rounded-pill bg-accent text-accent-ink text-[13px] font-bold py-3 active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              {state === "claiming" ? "Claiming…" : "Claim my founding spot"}
            </button>
          ) : (
            <p className="text-[11.5px] font-bold text-muted-foreground text-center">
              Founding spots are closed.
            </p>
          )}
          {error && state !== "closed" && (
            <p className="text-[11px] font-medium text-muted-foreground text-center">{error}</p>
          )}
        </Card>
      )}
    </div>
  );
}
