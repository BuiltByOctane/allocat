import { LayoutGrid, Wallet, TrendingUp, CreditCard, User, type LucideIcon } from "lucide-react";

export type NavItem = { label: string; href: string; Icon: LucideIcon };

// The 5 primary tabs, in order. Shared by the bottom dock (BottomNav), the
// desktop sidebar (SidebarNav), and the native swipe pager (SwipeNavigator) so
// tab order + active-tab resolution stay in one place.
export const navItems: NavItem[] = [
  { label: "Home", href: "/dashboard", Icon: LayoutGrid },
  { label: "Budget", href: "/budget", Icon: Wallet },
  { label: "Net Worth", href: "/net-worth", Icon: TrendingUp },
  { label: "Debt", href: "/debt", Icon: CreditCard },
  { label: "Profile", href: "/profile", Icon: User },
];

// Secondary routes that don't have their own tab but are reached *through*
// Profile. Keep the Profile pill active on these so the dock doesn't jump to
// Home. Profile sub-routes (/profile/*) are handled by the startsWith pass.
export const PROFILE_OWNED = ["/activity", "/sms", "/transactions", "/reports"];

export function hrefForPath(pathname: string): string {
  const match = navItems.find(
    (item) => pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href)),
  );
  if (match) return match.href;
  if (PROFILE_OWNED.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return "/profile";
  }
  return "/dashboard";
}
