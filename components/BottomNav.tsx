"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useHaptic } from "@/lib/hooks/useHaptic";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { label: "Budget", href: "/budget", icon: "account_balance_wallet" },
  { label: "Net Worth", href: "/net-worth", icon: "pie_chart" },
  { label: "Debt", href: "/debt", icon: "credit_card" },
  { label: "SMS", href: "/sms", icon: "sms" },
  { label: "Profile", href: "/profile", icon: "person" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const haptic = useHaptic();
  const router = useRouter();

  useEffect(() => {
    navItems.forEach((item) => router.prefetch(item.href));
  }, [router]);

  return (
    <nav className="md:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-background/95 backdrop-blur-md border-t border-border px-4 pt-3 pb-7 z-50">
      <div className="flex items-center justify-between">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => haptic.light()}
              className={`flex flex-1 flex-col items-center gap-1 transition-opacity ${
                isActive ? "opacity-100" : "opacity-65"
              }`}
            >
              <span
                className="material-symbols-outlined text-[22px] text-foreground"
                style={
                  isActive
                    ? { fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" }
                    : {}
                }
              >
                {item.icon}
              </span>
              <span className="font-mono text-[8px] tracking-[0.12em] uppercase text-foreground">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
