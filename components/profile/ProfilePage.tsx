"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Capacitor } from "@capacitor/core";
import { ChevronRight, History, MessageSquareText, CheckCircle2, Lightbulb, RotateCcw, LifeBuoy, Sun, Moon } from "lucide-react";
import UserAvatar from "@/components/profile/UserAvatar";
import AvatarPickerSheet from "@/components/profile/AvatarPickerSheet";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import AccentSelector from "@/components/profile/AccentSelector";
import { useRegisterQuickAction } from "@/lib/providers/QuickActionProvider";
import CurrencySelector from "@/components/profile/CurrencySelector";
import NotificationSoundSelector from "@/components/profile/NotificationSoundSelector";
import { ConfirmDrawer } from "@/components/ui/ConfirmDrawer";
import { signOut } from "@/lib/actions/auth";
import { useProfile } from "@/lib/hooks/useProfile";
import { useTour } from "@/lib/tour/useTour";
import {
  confirmAutoAllocate,
  setConfirmAutoAllocate,
  weeklyInsightsEnabled,
  setWeeklyInsightsEnabled,
} from "@/lib/sms/notifPrefs";
import { scheduleWeeklyRecap } from "@/lib/sms/recap";
import { SmsReader } from "@/lib/native/SmsReader";

export default function ProfilePage() {
  const { data: profile } = useProfile();
  const tour = useTour();
  const { resolvedTheme, setTheme } = useTheme();

  // Quick-action dock on /profile = light/dark toggle. Icon reflects the
  // theme you'd switch TO; re-registers when the theme changes.
  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);
  useRegisterQuickAction({
    id: "profile",
    label: "Toggle light / dark",
    icon: resolvedTheme === "dark" ? Sun : Moon,
    onTrigger: toggleTheme,
  });

  const [confirm, setConfirm] = useState(true);
  const [insights, setInsights] = useState(true);
  const [isNative, setIsNative] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  useEffect(() => {
    setConfirm(confirmAutoAllocate());
    setInsights(weeklyInsightsEnabled());
    setIsNative(Capacitor.isNativePlatform());
  }, []);
  function toggleConfirm() {
    const next = !confirm;
    setConfirm(next);
    setConfirmAutoAllocate(next);
    if (Capacitor.isNativePlatform()) {
      void SmsReader.setConfig({ confirmAutoAllocate: next });
    }
  }
  function toggleInsights() {
    const next = !insights;
    setInsights(next);
    setWeeklyInsightsEnabled(next);
    // Schedules immediately when on; cancels the pending one when off.
    void scheduleWeeklyRecap();
  }

  return (
    <div className="px-4 pt-4 flex flex-col gap-3">
      {/* Header */}
      <div className="px-1 pt-1">
        <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground">
          Profile
        </h1>
        <p className="text-[11px] font-medium text-muted-foreground mt-1">Financial identity</p>
      </div>

      {/* Lime identity card */}
      <div className="rounded-card bg-accent p-[18px] flex items-center gap-3.5 text-[var(--accent-ink)]">
        <button
          type="button"
          onClick={() => setAvatarOpen(true)}
          aria-label="Change avatar"
          className="relative flex size-14 shrink-0 items-center justify-center rounded-full bg-white/55 overflow-hidden"
        >
          <UserAvatar id={profile?.avatar} size={56} className="size-full" />
          <span className="absolute bottom-0 right-0 flex size-5 items-center justify-center rounded-full bg-foreground text-background ring-2 ring-accent">
            <span className="material-symbols-outlined text-[12px] leading-none">edit</span>
          </span>
        </button>
        <div className="flex-1 min-w-0">
          <Chip tone="good" className="bg-white/60 border-0 text-[var(--accent-ink)]">
            ✓ Verified
          </Chip>
          <div className="font-display text-[22px] font-bold mt-1.5 truncate" style={{ color: "var(--accent-ink)" }}>
            {profile?.full_name || "Anonymous Architect"}
          </div>
          <div className="text-[11px] font-medium text-[var(--accent-ink)] opacity-75 truncate">
            {profile?.email || ""}
          </div>
        </div>
      </div>

      {/* Account group */}
      <p className="t-label text-muted-foreground mt-1 ml-1">Account</p>

      <Link href="/activity" className="block active:scale-[0.99] transition-transform">
        <Card compact className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tile text-muted-foreground">
            <History size={18} strokeWidth={1.7} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-bold text-foreground">See Activity</div>
          </div>
          <ChevronRight size={16} strokeWidth={2} className="text-muted-foreground" />
        </Card>
      </Link>

      <Link href="/sms" className="block active:scale-[0.99] transition-transform">
        <Card compact className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tile text-muted-foreground">
            <MessageSquareText size={18} strokeWidth={1.7} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-bold text-foreground">SMS Transactions</div>
            <div className="text-[10.5px] font-medium text-muted-foreground mt-0.5">
              Review &amp; allocate spends from SMS
            </div>
          </div>
          <ChevronRight size={16} strokeWidth={2} className="text-muted-foreground" />
        </Card>
      </Link>

      {/* Preferences group */}
      <p className="t-label text-muted-foreground mt-1 ml-1">Preferences</p>

      <AccentSelector />
      <CurrencySelector />

      {/* Notifications group */}
      <p className="t-label text-muted-foreground mt-1 ml-1">Notifications</p>

      <Card compact className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tile text-muted-foreground">
          <CheckCircle2 size={18} strokeWidth={1.7} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-bold text-foreground">Auto-allocate alerts</div>
          <div className="text-[10.5px] font-medium text-muted-foreground mt-0.5">
            Confirm when a known merchant is auto-logged
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={confirm}
          onClick={toggleConfirm}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
            confirm ? "bg-foreground" : "bg-border"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform ${
              confirm ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </Card>

      {/* Weekly AI insight notification — native-only (scheduled local
          notification that fires when the app is closed). */}
      {isNative && (
        <Card compact className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tile text-muted-foreground">
            <Lightbulb size={18} strokeWidth={1.7} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-bold text-foreground">Weekly insights</div>
            <div className="text-[10.5px] font-medium text-muted-foreground mt-0.5">
              A useful AI summary each Sunday
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={insights}
            onClick={toggleInsights}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
              insights ? "bg-foreground" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform ${
                insights ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </Card>
      )}

      {/* Custom sound is an Android-native feature — the web Notification API
          can't set one, so only show the picker inside the native app. */}
      {isNative && <NotificationSoundSelector />}

      {/* Helper group */}
      <p className="t-label text-muted-foreground mt-1 ml-1">Helper</p>

      <Card compact className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tile text-muted-foreground">
          <Lightbulb size={18} strokeWidth={1.7} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-bold text-foreground">Guided Tours</div>
          <div className="text-[10.5px] font-medium text-muted-foreground mt-0.5">
            Show section guides on first visit
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={tour.enabled}
          onClick={() => tour.setEnabled(!tour.enabled)}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
            tour.enabled ? "bg-foreground" : "bg-border"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform ${
              tour.enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </Card>

      <button
        type="button"
        onClick={() => tour.resetTour()}
        className="block w-full text-left active:scale-[0.99] transition-transform"
      >
        <Card compact className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tile text-muted-foreground">
            <RotateCcw size={18} strokeWidth={1.7} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-bold text-foreground">Reset All Tours</div>
            <div className="text-[10.5px] font-medium text-muted-foreground mt-0.5">
              Show section guides again
            </div>
          </div>
          <ChevronRight size={16} strokeWidth={2} className="text-muted-foreground" />
        </Card>
      </button>

      {/* Support group */}
      <p className="t-label text-muted-foreground mt-1 ml-1">Support</p>

      <a
        href="mailto:innovationsoctane@gmail.com?subject=AlloCat%20Support"
        className="block active:scale-[0.99] transition-transform"
      >
        <Card compact className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tile text-muted-foreground">
            <LifeBuoy size={18} strokeWidth={1.7} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-bold text-foreground">Contact Support</div>
            <div className="text-[10.5px] font-medium text-muted-foreground mt-0.5">
              Report an issue or send feedback
            </div>
          </div>
          <ChevronRight size={16} strokeWidth={2} className="text-muted-foreground" />
        </Card>
      </a>

      {/* Logout */}
      <button
        type="button"
        onClick={() => setLogoutOpen(true)}
        className="mt-2 w-full h-[48px] rounded-pill border border-destructive/40 text-destructive text-sm font-bold uppercase tracking-[0.18em] hover:bg-destructive/10 active:scale-[0.98] transition-all"
      >
        Logout
      </button>

      <ConfirmDrawer
        isOpen={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={async () => {
          if (loggingOut) return;
          setLoggingOut(true);
          await signOut();
        }}
        title="Log out?"
        description="You'll need to sign in again to access your account."
        confirmText={loggingOut ? "Logging out…" : "Log out"}
        cancelText="Cancel"
      />

      <AvatarPickerSheet
        open={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        current={profile?.avatar}
      />

      <footer className="text-center mt-2 opacity-40">
        <p className="figure text-[11px] text-foreground">v1.0.4</p>
        <a
          href="https://octane.team"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-medium tracking-widest text-foreground"
        >
          octane.team
        </a>
        <p className="text-[10px] font-medium tracking-widest text-foreground mt-0.5">
          Built by © 2026 Octane Innovations
        </p>
      </footer>

      <div className="h-28 md:h-12" />
    </div>
  );
}
