"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import ThemeSelector from "@/components/profile/ThemeSelector";
import CurrencySelector from "@/components/profile/CurrencySelector";
import { signOut } from "@/lib/actions/auth";
import { useProfile } from "@/lib/hooks/useProfile";
import { useTour } from "@/lib/tour/useTour";
import { confirmAutoAllocate, setConfirmAutoAllocate } from "@/lib/sms/notifPrefs";
import { SmsReader } from "@/lib/native/SmsReader";

export default function ProfilePage() {
  const { data: profile } = useProfile();
  const tour = useTour();

  const [confirm, setConfirm] = useState(true);
  useEffect(() => setConfirm(confirmAutoAllocate()), []);
  function toggleConfirm() {
    const next = !confirm;
    setConfirm(next);
    setConfirmAutoAllocate(next);
    if (Capacitor.isNativePlatform()) {
      void SmsReader.setConfig({ confirmAutoAllocate: next });
    }
  }

  return (
    <>
      <header className="fixed w-full top-0 z-10 bg-background px-6 pt-6 pb-[18px] border-b border-border">
        <div className="max-w-2xl mx-auto">
          <div className="font-display text-[32px] leading-none tracking-[-0.02em] text-foreground">Profile</div>
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mt-2">
            Financial Identity
          </div>
        </div>
      </header>
      <div className="px-6 max-w-2xl mx-auto space-y-12 pb-24 pt-6 mt-20">

      {/* User Profile Section */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center bg-card/50 p-8 rounded-lg border border-border">
        <div className="col-span-1 flex justify-center md:justify-start">
          <div className="relative w-32 h-32 md:w-40 md:h-40 rounded-none bg-foreground p-1">
            <div className="w-full h-full bg-background flex items-center justify-center">
              <MaterialSymbol icon="person" size={64} className="text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="col-span-2 space-y-1">
          <p className="text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground font-bold">
            Verified Account
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            {profile?.full_name || "Anonymous Architect"}
          </h2>
          <p className="text-muted-foreground font-mono tracking-tight text-sm">
            {profile?.email || ""}
          </p>

        </div>
      </section>

      {/* Account Settings Section */}
      <section className="space-y-6">
        <div className="flex items-end gap-3 mb-2">
          <h3 className="text-lg font-bold tracking-tight uppercase text-foreground">Account</h3>
          <div className="h-px bg-border flex-grow mb-2"></div>
        </div>

        <div className="space-y-1">
          <Link
            href="/activity"
            className="w-full flex justify-between items-center p-5 bg-card/50 border border-border hover:bg-muted transition-colors group"
          >
            <div className="flex items-center gap-4">
              <MaterialSymbol icon="history" className="text-muted-foreground" />
              <span className="font-bold tracking-tight text-foreground">See Activity</span>
            </div>
            <MaterialSymbol
              icon="chevron_right"
              className="text-muted-foreground group-hover:translate-x-1 transition-transform"
            />
          </Link>

          <Link
            href="/sms"
            className="w-full flex justify-between items-center p-5 bg-card/50 border border-border hover:bg-muted transition-colors group"
          >
            <div className="flex items-center gap-4">
              <MaterialSymbol icon="sms" className="text-muted-foreground" />
              <div>
                <span className="font-bold tracking-tight text-foreground block">SMS Transactions</span>
                <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground">
                  Review & allocate spends from SMS
                </span>
              </div>
            </div>
            <MaterialSymbol
              icon="chevron_right"
              className="text-muted-foreground group-hover:translate-x-1 transition-transform"
            />
          </Link>

        </div>
      </section>

      {/* App Preferences Section */}
      <section className="space-y-6">
        <div className="flex items-end gap-3 mb-2">
          <h3 className="text-lg font-bold tracking-tight uppercase text-foreground">Preferences</h3>
          <div className="h-px bg-border flex-grow mb-2"></div>
        </div>

        <ThemeSelector />
        <CurrencySelector />
      </section>

      {/* Notifications Section */}
      <section className="space-y-6">
        <div className="flex items-end gap-3 mb-2">
          <h3 className="text-lg font-bold tracking-tight uppercase text-foreground">Notifications</h3>
          <div className="h-px bg-border flex-grow mb-2"></div>
        </div>

        <div className="flex justify-between items-center p-5 bg-card/50 border border-border">
          <div className="flex items-center gap-4">
            <MaterialSymbol icon="check_circle" className="text-muted-foreground" />
            <div>
              <span className="font-bold tracking-tight text-foreground block">Auto-allocate alerts</span>
              <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground">
                Confirm when a known merchant is auto-logged
              </span>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={confirm}
            onClick={toggleConfirm}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              confirm ? "bg-foreground" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background shadow transition-transform ${
                confirm ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </section>

      {/* Helper / Tour Section */}
      <section className="space-y-6">
        <div className="flex items-end gap-3 mb-2">
          <h3 className="text-lg font-bold tracking-tight uppercase text-foreground">Helper</h3>
          <div className="h-px bg-border flex-grow mb-2"></div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center p-5 bg-card/50 border border-border">
            <div className="flex items-center gap-4">
              <MaterialSymbol icon="lightbulb" className="text-muted-foreground" />
              <div>
                <span className="font-bold tracking-tight text-foreground block">Guided Tours</span>
                <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground">
                  Show section guides on first visit
                </span>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={tour.enabled}
              onClick={() => tour.setEnabled(!tour.enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                tour.enabled ? "bg-foreground" : "bg-border"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background shadow transition-transform ${
                  tour.enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <button
            type="button"
            onClick={() => tour.resetTour()}
            className="w-full flex justify-between items-center p-5 bg-card/50 border border-border hover:bg-muted transition-colors group"
          >
            <div className="flex items-center gap-4">
              <MaterialSymbol icon="replay" className="text-muted-foreground" />
              <span className="font-bold tracking-tight text-foreground">Reset All Tours</span>
            </div>
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground group-hover:text-foreground transition-colors">
              Reset →
            </span>
          </button>
        </div>
      </section>

      {/* Actions */}
      <section className="py-12 flex flex-col items-center gap-8">
        <form action={signOut} className="w-full max-w-sm">
          <button
            type="submit"
            className="group relative flex items-center justify-center w-full py-5 border border-red-500/30 hover:bg-red-500/10 transition-all duration-300 active:scale-95"
          >
            <span className="text-red-500 font-black uppercase tracking-[0.3em] text-sm">Logout</span>
          </button>
        </form>

        <footer className="text-center space-y-1 opacity-40">
          <p className="text-[0.6rem] font-mono font-bold uppercase tracking-[0.4em] text-foreground tabular-nums">v1.0.4</p>
          <p className="text-[0.5rem] font-mono font-medium tracking-widest text-foreground tabular-nums">AlloCat © 2026</p>
        </footer>
      </section>
    </div>
    </>
  );
}
