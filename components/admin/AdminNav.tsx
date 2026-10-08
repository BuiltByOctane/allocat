"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";

const LINKS = [
  { href: "/admin", icon: "monitoring", label: "Overview" },
  { href: "/admin/growth", icon: "trending_up", label: "Growth" },
  { href: "/admin/users", icon: "group", label: "Users" },
  { href: "/admin/support", icon: "inbox", label: "Support" },
  { href: "/admin/broadcast", icon: "campaign", label: "Broadcast" },
  { href: "/admin/config", icon: "tune", label: "Config" },
];

/** Product & GTM handbook — a private claude.ai artifact, opened in a new tab. */
const HANDBOOK_URL = "https://claude.ai/artifact/DKEKbFxELMbwZQccXeNemY";

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
      {LINKS.map((l) => {
        // Exact match for the index so every child route doesn't light it up.
        const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={[
              "flex items-center gap-2.5 rounded-pill px-3.5 py-2.5 t-body-sm font-semibold whitespace-nowrap transition-colors",
              active
                ? "bg-[var(--pill)] text-[var(--pill-foreground)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
          >
            <MaterialSymbol icon={l.icon} size={18} />
            {l.label}
            <PendingDot />
          </Link>
        );
      })}
      <a
        href={HANDBOOK_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2.5 rounded-pill px-3.5 py-2.5 t-body-sm font-semibold whitespace-nowrap transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <MaterialSymbol icon="menu_book" size={18} />
        Handbook
        <MaterialSymbol icon="open_in_new" size={14} className="ml-auto" />
      </a>
    </nav>
  );
}

/** Shows on the clicked link until its route renders — instant click feedback. */
function PendingDot() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={[
        "ml-auto size-1.5 rounded-full bg-current transition-opacity",
        pending ? "opacity-100 animate-pulse" : "opacity-0",
      ].join(" ")}
    />
  );
}
