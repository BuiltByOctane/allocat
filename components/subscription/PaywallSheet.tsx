"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { PRICING, TRIAL_DAYS } from "@/lib/subscription/limits";
import type { Entitlement } from "@/lib/subscription/entitlement";

export interface PaywallSheetProps {
  isOpen: boolean;
  onClose: () => void;
  entitlement: Entitlement;
  /** True on the native Android shell (purchases allowed). Web has no buy button. */
  isNative: boolean;
  /** Start the opt-in free trial (only offered when the trial is unused). */
  onStartTrial: () => void;
  /** Begin checkout for a plan (native only). */
  onCheckout: (plan: "monthly" | "yearly") => void;
  /** Why the paywall opened — drives the headline copy. */
  reason?: string;
  starting?: boolean;
}

const FEATURES = [
  { icon: "auto_awesome", label: "AI chat & insights" },
  { icon: "flag", label: "Unlimited goals" },
  { icon: "savings", label: "Unlimited assets & net worth" },
  { icon: "account_balance", label: "Unlimited debt tracking" },
];

const REASON_HEADLINES: Record<string, string> = {
  goals: "More goals need Premium",
  assets: "More assets need Premium",
  debts: "More debts need Premium",
  ai: "AI is a Premium feature",
  history: "Full history is Premium",
  export: "Export is a Premium feature",
};

// ~26% cheaper than 12× monthly.
const YEARLY_SAVE_PCT = Math.round(
  (1 - PRICING.yearly.amount / (PRICING.monthly.amount * 12)) * 100,
);

export function PaywallSheet({
  isOpen,
  onClose,
  entitlement,
  isNative,
  onStartTrial,
  onCheckout,
  reason,
  starting = false,
}: PaywallSheetProps) {
  const haptic = useHaptic();
  const [plan, setPlan] = useState<"monthly" | "yearly">("yearly");

  const canTrial = !entitlement.hasUsedTrial;
  const headline = canTrial
    ? `Try Premium free for ${TRIAL_DAYS} days`
    : (reason && REASON_HEADLINES[reason]) || "Unlock AlloCat Premium";

  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card px-5 pt-3 pb-safe focus:outline-none max-w-[480px] mx-auto sheet-3q">
          <div className="flex justify-center pb-4 shrink-0">
            <div className="w-9 h-1 bg-border rounded-full" />
          </div>

          {/* Header */}
          <div className="text-center mb-5 shrink-0">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent/15 mb-3">
              <span className="material-symbols-outlined text-accent">
                workspace_premium
              </span>
            </div>
            <Drawer.Title className="font-display text-[22px] font-bold tracking-[-0.02em] text-foreground">
              {headline}
            </Drawer.Title>
            <p className="text-sm text-muted-foreground mt-1">
              Everything in AlloCat, no limits.
            </p>
          </div>

          {/* Scrollable middle */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Feature list */}
          <ul className="flex flex-col gap-2.5 mb-5">
            {FEATURES.map((f) => (
              <li key={f.label} className="flex items-center gap-3">
                <span className="material-symbols-outlined text-accent text-[20px]">
                  {f.icon}
                </span>
                <span className="text-sm text-foreground">{f.label}</span>
              </li>
            ))}
          </ul>

          {/* Plan toggle */}
          <div className="grid grid-cols-2 gap-2.5 mb-5">
            <PlanCard
              active={plan === "monthly"}
              onClick={() => {
                haptic.selection();
                setPlan("monthly");
              }}
              title="Monthly"
              price={PRICING.monthly.label}
              sub={`per ${PRICING.monthly.period}`}
            />
            <PlanCard
              active={plan === "yearly"}
              onClick={() => {
                haptic.selection();
                setPlan("yearly");
              }}
              title="Yearly"
              price={PRICING.yearly.label}
              sub={`per ${PRICING.yearly.period}`}
              badge={`Save ${YEARLY_SAVE_PCT}%`}
            />
          </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col gap-3 pb-6 shrink-0">
            {canTrial ? (
              <button
                disabled={starting}
                onClick={() => {
                  haptic.medium();
                  onStartTrial();
                }}
                className="w-full py-3.5 bg-accent text-accent-ink font-bold rounded-pill active:scale-[0.98] transition-all disabled:opacity-60"
              >
                {starting ? "Starting…" : `Start ${TRIAL_DAYS}-day free trial`}
              </button>
            ) : isNative ? (
              <button
                onClick={() => {
                  haptic.medium();
                  onCheckout(plan);
                }}
                className="w-full py-3.5 bg-accent text-accent-ink font-bold rounded-pill active:scale-[0.98] transition-all"
              >
                Subscribe — {PRICING[plan].label}/{PRICING[plan].period}
              </button>
            ) : (
              <div className="w-full py-3.5 bg-muted text-center text-sm text-muted-foreground font-medium rounded-pill">
                Subscribe in the AlloCat Android app
              </div>
            )}
            <button
              onClick={() => {
                haptic.light();
                onClose();
              }}
              className="w-full py-3 text-muted-foreground font-semibold rounded-pill active:scale-[0.98] transition-all"
            >
              Maybe later
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function PlanCard({
  active,
  onClick,
  title,
  price,
  sub,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  price: string;
  sub: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-2xl border px-3 py-3 text-left transition-all active:scale-[0.98] ${
        active
          ? "border-accent bg-accent/10"
          : "border-border bg-background"
      }`}
    >
      {badge && (
        <span className="absolute -top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent text-accent-ink">
          {badge}
        </span>
      )}
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="font-display text-lg font-bold text-foreground">
        {price}
      </div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </button>
  );
}
