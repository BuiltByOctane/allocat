"use client";

import { Capacitor } from "@capacitor/core";
import { Crown, Sparkles, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useEntitlement } from "@/lib/providers/EntitlementProvider";
import { usePaywall } from "@/lib/providers/PaywallProvider";
import { useRestorePurchases } from "@/lib/hooks/useSubscription";
import { PRICING } from "@/lib/subscription/limits";

/**
 * Profile entry for subscription state: shows the current plan / trial countdown
 * and a way to upgrade. Restore purchases is offered on native only.
 */
export default function SubscriptionCard() {
  const entitlement = useEntitlement();
  const { open } = usePaywall();
  const restore = useRestorePurchases();
  const haptic = useHaptic();
  const isNative = Capacitor.isNativePlatform();

  const { tier, isPaid, inTrial, daysLeft, hasUsedTrial } = entitlement;

  const status = isPaid
    ? "Premium · active"
    : inTrial
      ? `Trial · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
      : "Free plan";

  const subtitle = isPaid
    ? "Thanks for supporting AlloCat"
    : inTrial
      ? "Enjoy everything, no limits"
      : hasUsedTrial
        ? `Upgrade for ${PRICING.monthly.label}/mo or ${PRICING.yearly.label}/yr`
        : `Try Premium free, then ${PRICING.monthly.label}/mo`;

  const ctaLabel = isPaid
    ? null
    : hasUsedTrial
      ? "Upgrade"
      : "Start free trial";

  const onCta = () => {
    haptic.light();
    open("profile");
  };

  return (
    <>
      <p className="t-label text-muted-foreground mt-1 ml-1">Subscription</p>

      <Card compact className="flex items-center gap-3">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-[11px] ${
            tier === "premium"
              ? "bg-accent/15 text-accent"
              : "bg-tile text-muted-foreground"
          }`}
        >
          {tier === "premium" ? (
            <Crown size={18} strokeWidth={1.7} />
          ) : (
            <Sparkles size={18} strokeWidth={1.7} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-bold text-foreground">{status}</div>
          <div className="text-[10.5px] font-medium text-muted-foreground mt-0.5">
            {subtitle}
          </div>
        </div>
        {ctaLabel ? (
          <button
            type="button"
            onClick={onCta}
            className="shrink-0 rounded-pill bg-accent text-accent-ink text-[12px] font-bold px-3.5 py-2 active:scale-[0.97] transition-transform"
          >
            {ctaLabel}
          </button>
        ) : (
          <ChevronRight size={16} strokeWidth={2} className="text-muted-foreground" />
        )}
      </Card>

      {/* Restore is native-only (Google Play); hidden on web. */}
      {isNative && (
        <button
          type="button"
          onClick={() => {
            haptic.light();
            restore.mutate();
          }}
          disabled={restore.isPending}
          className="w-full text-center text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors py-1 disabled:opacity-50"
        >
          {restore.isPending ? "Restoring…" : "Restore purchases"}
        </button>
      )}
    </>
  );
}
