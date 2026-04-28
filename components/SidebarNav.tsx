"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHaptic } from "@/lib/hooks/useHaptic";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { label: "Budget", href: "/budget", icon: "account_balance_wallet" },
  { label: "Net Worth", href: "/net-worth", icon: "pie_chart" },
  { label: "Debt", href: "/debt", icon: "credit_card" },
  { label: "Profile", href: "/profile", icon: "person" },
];

export default function SidebarNav() {
  const pathname = usePathname();
  const haptic = useHaptic();
  const router = useRouter();
  const [showMobileHint, setShowMobileHint] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("mobile-hint-dismissed")) setShowMobileHint(true);
  }, []);

  useEffect(() => {
    navItems.forEach((item) => router.prefetch(item.href));
  }, [router]);

  const dismissHint = () => {
    localStorage.setItem("mobile-hint-dismissed", "1");
    setShowMobileHint(false);
  };

  return (
    <aside className="hidden md:flex flex-col w-60 border-r border-border bg-background min-h-screen sticky top-0">
      <div className="px-7 py-8 border-b border-border">
        <div className="font-display text-[26px] leading-none tracking-[-0.02em] text-foreground">
          AlloCat
        </div>
        <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground mt-1.5">
          Financial Overview
        </div>
      </div>

      <nav className="flex-1 py-6">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => haptic.light()}
              className={`flex items-center gap-3 px-7 py-3 transition-colors ${
                isActive
                  ? "text-foreground border-r border-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={
                  isActive
                    ? { fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" }
                    : {}
                }
              >
                {item.icon}
              </span>
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="px-7 py-5 border-t border-border flex flex-col gap-3">
        {showMobileHint && (
          <div className="p-3 border border-border flex items-start gap-2">
            <span className="material-symbols-outlined text-muted-foreground shrink-0 mt-0.5" style={{ fontSize: "14px" }}>
              smartphone
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-foreground">Better on mobile</p>
              <p className="font-mono text-[9px] text-muted-foreground mt-1 leading-relaxed">
                AlloCat is designed for your phone.
              </p>
            </div>
            <button onClick={dismissHint} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>close</span>
            </button>
          </div>
        )}
        <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted-foreground">
          AlloCat © {new Date().getFullYear()}
        </p>
      </div>
    </aside>
  );
}
