"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useUnreadCount } from "@/lib/hooks/useNotifications";

/**
 * Bell entry point to the local notification inbox with an unread-count badge.
 * Shared by the dashboard header and the profile header.
 */
export default function NotificationBell({ className = "" }: { className?: string }) {
  const unread = useUnreadCount();

  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      className={`relative flex size-[38px] items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      <Bell size={18} strokeWidth={2} />
      {unread > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-[var(--accent-ink)]">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
