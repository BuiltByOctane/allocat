"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "motion/react";
import { navItems } from "@/lib/nav/navItems";
import { useIsNative } from "@/lib/hooks/useIsNative";
import { TabPager } from "./TabPager";

/**
 * Decides between the native single-sheet TabPager and plain route content.
 *
 * On the Capacitor app, while the URL is one of the 5 tab roots, render the
 * TabPager (which owns all tab content) and drop `children` — the active route's
 * page would otherwise double-mount. Everywhere else (web/PWA/desktop, any
 * non-tab/detail route, or reduced-motion) render `children` exactly as before.
 */
export function PagerGate({ children }: { children: ReactNode }) {
  const isNative = useIsNative();
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const isTab = navItems.some((item) => item.href === pathname);

  if (isNative && !reduce && isTab) return <TabPager />;

  return <div className="md:max-w-5xl md:mx-auto w-full pb-10">{children}</div>;
}
