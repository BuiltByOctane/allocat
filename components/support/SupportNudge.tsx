"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Heart, X } from "lucide-react";
import { useProfile } from "@/lib/hooks/useProfile";
import { useIsSupporter } from "@/lib/hooks/useSupporter";
import { useHaptic } from "@/lib/hooks/useHaptic";

const DISMISS_KEY = "allocat-support-nudge-seen";
const MIN_ACCOUNT_AGE_DAYS = 14;

function isEligible(createdAt: string | undefined): boolean {
  if (!createdAt) return false;
  if (localStorage.getItem(DISMISS_KEY) === "1") return false;
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  return Number.isFinite(ageDays) && ageDays >= MIN_ACCOUNT_AGE_DAYS;
}

/**
 * The only place AlloCat ever brings up money on its own.
 *
 * Shows once, on the dashboard, after the account is a fortnight old — long
 * enough that the app has actually been useful. Dismissing hides it for good;
 * supporters never see it. No modal, no repeat, nothing gated behind it.
 */
export function SupportNudge() {
  const { data: profile } = useProfile();
  const isSupporter = useIsSupporter();
  const haptic = useHaptic();
  const [dismissed, setDismissed] = useState(false);
  const createdAt = profile?.created_at;

  // localStorage and the clock are both client-only. useSyncExternalStore keeps
  // the server snapshot at `false`, so SSR and hydration agree on "hidden".
  const eligible = useSyncExternalStore(
    useCallback(() => () => {}, []),
    useCallback(() => isEligible(createdAt), [createdAt]),
    () => false,
  );

  if (!eligible || dismissed || isSupporter) return null;

  const dismiss = () => {
    haptic.light();
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="relative rounded-card border border-border bg-card p-3.5 flex items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-accent/15 text-accent">
        <Heart size={18} strokeWidth={1.7} />
      </div>
      <div className="flex-1 min-w-0 pr-5">
        <div className="text-[13.5px] font-bold text-foreground">
          AlloCat is free — and staying that way
        </div>
        <p className="text-[10.5px] font-medium text-muted-foreground mt-0.5 leading-relaxed">
          No plans, no limits.{" "}
          <Link href="/support" className="font-bold text-foreground underline underline-offset-2">
            Here&apos;s why
          </Link>
          , and how to chip in if you ever feel like it.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2.5 top-2.5 flex size-6 items-center justify-center rounded-full text-muted-foreground active:scale-90 transition-transform"
      >
        <X size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}

export default SupportNudge;
