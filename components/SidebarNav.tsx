"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutGrid, Wallet, TrendingUp, CreditCard, User, Smartphone, X, type LucideIcon } from "lucide-react";
import { useHaptic } from "@/lib/hooks/useHaptic";

type NavItem = { label: string; href: string; Icon: LucideIcon };

const navItems: NavItem[] = [
  { label: "Home", href: "/dashboard", Icon: LayoutGrid },
  { label: "Budget", href: "/budget", Icon: Wallet },
  { label: "Net Worth", href: "/net-worth", Icon: TrendingUp },
  { label: "Debt", href: "/debt", Icon: CreditCard },
  { label: "Profile", href: "/profile", Icon: User },
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
    <aside className="hidden md:flex flex-col w-64 border-r border-border bg-background min-h-screen sticky top-0">
      <div className="px-6 py-7">
        <div className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground">
          AlloCat
        </div>
        <div className="text-[11px] font-medium text-muted-foreground mt-1.5">
          Financial overview
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const { Icon } = item;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => haptic.light()}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-[var(--pill)] text-[var(--pill-foreground)]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.2 : 1.9} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-5 flex flex-col gap-3">
        {showMobileHint && (
          <div className="p-3 rounded-2xl bg-card border border-border flex items-start gap-2.5">
            <Smartphone size={15} className="text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-foreground">Better on mobile</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                AlloCat is designed for your phone.
              </p>
            </div>
            <button onClick={dismissHint} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <X size={15} />
            </button>
          </div>
        )}
        <p className="text-[11px] font-medium text-muted-foreground px-1">
          AlloCat © {new Date().getFullYear()}
        </p>
      </div>
    </aside>
  );
}
