"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Bell,
  BellOff,
  PawPrint,
  TriangleAlert,
  Flame,
  Gauge,
  CheckCircle2,
  CalendarClock,
  X,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  useNotifications,
  useNotificationActions,
} from "@/lib/hooks/useNotifications";
import type { NotificationRow, NotifKind } from "@/lib/db";

const ICON_FOR_KIND: Record<NotifKind, LucideIcon> = {
  "wild-spend": PawPrint,
  "near-limit": TriangleAlert,
  overspend: Flame,
  pace: Gauge,
  "auto-allocate": CheckCircle2,
  "budget-reminder": CalendarClock,
  other: Bell,
};

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.round(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function dateGroupLabel(ms: number): string {
  const todayStr = new Date().toDateString();
  const yesterdayStr = new Date(Date.now() - 86_400_000).toDateString();
  const ds = new Date(ms).toDateString();
  if (ds === todayStr) return "Today";
  if (ds === yesterdayStr) return "Yesterday";
  return new Date(ms).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function groupByDate(rows: NotificationRow[]): { label: string; items: NotificationRow[] }[] {
  const groups = new Map<string, NotificationRow[]>();
  for (const n of rows) {
    const label = dateGroupLabel(n.createdAt);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(n);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

export default function NotificationsPage() {
  const router = useRouter();
  const { data, isLoading } = useNotifications();
  const { markRead, markAllRead, removeOne, clearAll } = useNotificationActions();

  const rows = data ?? [];
  const groups = groupByDate(rows);
  const hasUnread = rows.some((n) => !n.read);

  async function open(n: NotificationRow) {
    if (!n.read) await markRead(n.id);
    if (n.url) router.push(n.url);
  }

  return (
    <div className="px-4 pt-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 px-1 pt-1">
        <Link
          href="/profile"
          aria-label="Back"
          className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-foreground"
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground">
            Notifications
          </h1>
          <p className="text-[11px] font-medium text-muted-foreground mt-1">Alerts sent to this device</p>
        </div>
      </div>

      {/* Actions */}
      {rows.length > 0 && (
        <div className="flex items-center justify-end gap-4 px-1">
          {hasUnread && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Mark all read
            </button>
          )}
          <button
            type="button"
            onClick={() => void clearAll()}
            className="text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="pt-1 space-y-5">
        {isLoading && (
          <div className="space-y-2.5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-[64px] bg-muted/50 animate-pulse rounded-card" />
            ))}
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex size-12 items-center justify-center rounded-[14px] bg-tile text-muted-foreground mb-4">
              <BellOff size={24} strokeWidth={1.7} />
            </div>
            <p className="font-bold text-foreground">No notifications</p>
            <p className="text-sm text-muted-foreground mt-1">
              Spend and budget alerts will show up here
            </p>
          </div>
        )}

        {groups.map(({ label, items }) => (
          <div key={label}>
            <p className="t-label text-muted-foreground mb-2 ml-1">{label}</p>
            <div className="space-y-2.5">
              {items.map((n) => {
                const Icon = ICON_FOR_KIND[n.kind] ?? Bell;
                return (
                  <Card
                    key={n.id}
                    compact
                    className={`flex items-center gap-3 ${n.read ? "" : "border-accent/40"}`}
                  >
                    <button
                      type="button"
                      onClick={() => void open(n)}
                      className="flex flex-1 items-center gap-3 min-w-0 text-left"
                    >
                      <div className="relative flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-tile text-foreground">
                        <Icon size={19} strokeWidth={1.9} />
                        {!n.read && (
                          <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-accent ring-2 ring-card" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[14px] ${n.read ? "font-medium text-foreground" : "font-bold text-foreground"}`}>
                          {n.title}
                        </p>
                        <p className="truncate text-[12px] text-muted-foreground">{n.body}</p>
                      </div>
                      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                        {timeAgo(n.createdAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeOne(n.id)}
                      aria-label="Dismiss notification"
                      className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <X size={15} strokeWidth={2} />
                    </button>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
