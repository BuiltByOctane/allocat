"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, useReducedMotion, type Transition } from "motion/react";
import { LayoutGrid, Wallet, TrendingUp, CreditCard, User, type LucideIcon } from "lucide-react";
import { useHaptic } from "@/lib/hooks/useHaptic";

type NavItem = { label: string; href: string; Icon: LucideIcon };

const navItems: NavItem[] = [
  { label: "Home", href: "/dashboard", Icon: LayoutGrid },
  { label: "Budget", href: "/budget", Icon: Wallet },
  { label: "Worth", href: "/net-worth", Icon: TrendingUp },
  { label: "Debt", href: "/debt", Icon: CreditCard },
  { label: "You", href: "/profile", Icon: User },
];

function hrefForPath(pathname: string): string {
  const match = navItems.find(
    (item) => pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href)),
  );
  return match?.href ?? "/dashboard";
}

export default function BottomNav() {
  const pathname = usePathname();
  const haptic = useHaptic();
  const router = useRouter();
  const reduce = useReducedMotion();

  // Optimistic active tab: flips the instant you tap (before the route commits),
  // so the pill slides immediately instead of waiting on navigation.
  const [active, setActive] = useState(() => hrefForPath(pathname));

  useEffect(() => {
    setActive(hrefForPath(pathname));
  }, [pathname]);

  useEffect(() => {
    navItems.forEach((item) => router.prefetch(item.href));
  }, [router]);

  const spring: Transition = reduce
    ? { duration: 0 }
    : { type: "spring", stiffness: 560, damping: 38, mass: 0.7 };

  return (
    <motion.nav
      layout
      transition={spring}
      className="md:hidden fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-[5px] p-1.5 rounded-nav glass-dock"
      style={{ bottom: "calc(14px + env(safe-area-inset-bottom))", willChange: "transform" }}
    >
      {navItems.map((item) => {
        const isActive = active === item.href;
        const { Icon } = item;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              setActive(item.href);
              haptic.light();
            }}
            className="relative flex items-center justify-center"
          >
            <motion.span
              layout
              transition={spring}
              className={`relative flex items-center justify-center ${
                isActive ? "h-11 gap-1.5 rounded-[22px] px-3.5" : "size-9 rounded-full"
              }`}
              style={{ willChange: "transform" }}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-[22px] bg-[var(--navpill)]"
                  transition={spring}
                  style={{ willChange: "transform" }}
                />
              )}
              {!isActive && (
                <span className="absolute inset-0 rounded-full bg-[var(--nav-circle)] shadow-[0_2px_6px_rgba(0,0,0,0.08)]" />
              )}
              <Icon
                size={18}
                strokeWidth={isActive ? 2 : 1.8}
                className={`relative z-10 ${isActive ? "text-[var(--navpill-foreground)]" : "text-[var(--nav-circle-foreground)]"}`}
              />
              {isActive && (
                <motion.span
                  initial={reduce ? false : { opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="relative z-10 overflow-hidden whitespace-nowrap text-[12.5px] font-semibold text-[var(--navpill-foreground)]"
                >
                  {item.label}
                </motion.span>
              )}
            </motion.span>
          </Link>
        );
      })}
    </motion.nav>
  );
}
