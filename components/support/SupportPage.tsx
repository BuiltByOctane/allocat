"use client";

import { useState } from "react";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { ChevronLeft, Heart, Server, Sparkles, ShieldCheck, Store } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CrownBadge } from "@/components/ui/CrownBadge";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useIsSupporter, useSupporterSince } from "@/lib/hooks/useSupporter";
import { syncSupporterStatus } from "@/lib/actions/support";
import { markSupporterLocally } from "@/lib/support/local";
import { PROFILE_KEY } from "@/lib/hooks/useProfile";
import { useQueryClient } from "@tanstack/react-query";
import {
  KOFI_URL,
  SUPPORT_WEB_URL,
  SUPPORT_CONTACT_EMAIL,
  SUPPORT_CTA_ON_NATIVE,
} from "@/lib/support/links";

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
  const isSupporter = useIsSupporter();
  const since = formatSince(useSupporterSince());
  const haptic = useHaptic();
  const qc = useQueryClient();

  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<"none" | "found" | "missing">("none");

  const isNative = Capacitor.isNativePlatform();
  const showKofiButton = !isNative || SUPPORT_CTA_ON_NATIVE;

  async function openKofi() {
    haptic.light();
    // Native opens the system browser — payment never happens inside the app.
    if (isNative) {
      await Browser.open({ url: KOFI_URL });
      return;
    }
    window.open(KOFI_URL, "_blank", "noopener,noreferrer");
  }

  async function claim() {
    haptic.light();
    setClaiming(true);
    try {
      const { isSupporter: found } = await syncSupporterStatus();
      if (found) {
        await markSupporterLocally();
        qc.invalidateQueries({ queryKey: PROFILE_KEY });
        setClaimResult("found");
      } else {
        setClaimResult("missing");
      }
    } catch {
      setClaimResult("missing");
    } finally {
      setClaiming(false);
    }
  }

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
          Everything in AlloCat is free. All of it. Forever.
        </p>
        <p className="text-[12.5px] font-medium leading-relaxed mt-2 opacity-85">
          No plans, no trial, no locked features, no &ldquo;upgrade to
          continue&rdquo;. I built AlloCat because I wanted a money app that
          didn&apos;t nag me, and charging for it would have made it exactly the
          thing I was trying to avoid.
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

      {/* Supporter state, or the ask */}
      {isSupporter ? (
        <Card className="flex flex-col items-center text-center gap-1.5 mt-1">
          <CrownBadge size={64} />
          <div className="font-display text-[19px] font-bold text-foreground leading-tight">
            Thank you, genuinely
          </div>
          <p className="text-[12px] font-medium text-muted-foreground leading-relaxed">
            {since
              ? `You've been supporting AlloCat since ${since}.`
              : "You're one of the people keeping AlloCat running."}{" "}
            You didn&apos;t buy anything — the app was always going to be free.
            You just made it easier to keep going.
          </p>
        </Card>
      ) : (
        <>
          <p className="t-label text-muted-foreground mt-1 ml-1">If you want to chip in</p>
          <Card className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-accent/15 text-accent">
                <Heart size={18} strokeWidth={1.7} />
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-foreground">
                  Only if you want to
                </div>
                <p className="text-[11.5px] font-medium text-muted-foreground leading-relaxed mt-1">
                  If AlloCat has been useful and you feel like covering a bit of
                  the bill, you can leave a tip on Ko-fi — once, or monthly,
                  whatever suits. It changes nothing about your app: no extra
                  features, no higher limits. Everyone gets the same AlloCat.
                </p>
              </div>
            </div>

            {showKofiButton ? (
              <button
                type="button"
                onClick={openKofi}
                className="w-full rounded-pill bg-accent text-accent-ink text-[13px] font-bold py-3 active:scale-[0.98] transition-transform"
              >
                Support on Ko-fi
              </button>
            ) : (
              <p className="text-[11.5px] font-medium text-muted-foreground text-center leading-relaxed">
                You can leave a tip at{" "}
                <span className="font-bold text-foreground">{SUPPORT_WEB_URL}</span>
              </p>
            )}
          </Card>

          {/* Already donated — reconcile by email. */}
          <button
            type="button"
            onClick={claim}
            disabled={claiming}
            className="w-full text-center text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors py-1 disabled:opacity-50"
          >
            {claiming ? "Checking…" : "I already supported"}
          </button>

          {claimResult === "missing" && (
            <p className="text-[11px] font-medium text-muted-foreground text-center leading-relaxed px-2">
              Nothing found for this account&apos;s email yet. Ko-fi can take a
              minute — or if you used a different email, mail me at{" "}
              <a
                href={`mailto:${SUPPORT_CONTACT_EMAIL}`}
                className="font-bold text-foreground underline underline-offset-2"
              >
                {SUPPORT_CONTACT_EMAIL}
              </a>
              .
            </p>
          )}
          {claimResult === "found" && (
            <p className="text-[11px] font-medium text-accent text-center">
              Found it — thank you! 💚
            </p>
          )}
        </>
      )}
    </div>
  );
}
