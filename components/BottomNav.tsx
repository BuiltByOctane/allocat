"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
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

// Child of <Link> — useLinkStatus reads the nearest Link's pending state, so a
// tap nudges the icon before the route commits.
function PendingScale({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className={`flex items-center transition-transform ${pending ? "scale-110" : ""}`}>
      {children}
    </span>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const haptic = useHaptic();
  const router = useRouter();
  const reduce = useReducedMotion();

  useEffect(() => {
    navItems.forEach((item) => router.prefetch(item.href));
  }, [router]);

  const spring = reduce
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 420, damping: 34 } as const);

  return (
    <nav
      className="md:hidden fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-[5px] p-1.5 rounded-nav glass-dock"
      style={{ bottom: "calc(14px + env(safe-area-inset-bottom))" }}
    >
      {navItems.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
        const { Icon } = item;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            onClick={() => haptic.light()}
            className="relative flex items-center justify-center"
          >
            <PendingScale>
              {isActive ? (
                <motion.span
                  layout
                  className="relative flex h-11 items-center gap-1.5 rounded-[22px] px-3.5"
                  transition={spring}
                >
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-[22px] bg-[var(--navpill)]"
                    transition={spring}
                  />
                  <Icon
                    size={18}
                    strokeWidth={2}
                    className="relative z-10 text-[var(--navpill-foreground)]"
                  />
                  <motion.span
                    initial={reduce ? false : { opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    transition={reduce ? { duration: 0 } : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="relative z-10 overflow-hidden whitespace-nowrap text-[12.5px] font-semibold text-[var(--navpill-foreground)]"
                  >
                    {item.label}
                  </motion.span>
                </motion.span>
              ) : (
                <motion.span
                  layout
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--nav-circle)] text-[var(--nav-circle-foreground)] shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
                  transition={spring}
                >
                  <Icon size={18} strokeWidth={1.8} />
                </motion.span>
              )}
            </PendingScale>
          </Link>
        );
      })}
    </nav>
  );
}
