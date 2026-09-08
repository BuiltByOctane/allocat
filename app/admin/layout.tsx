import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminNav } from "@/components/admin/AdminNav";

// Every page here is a live read of the whole user base — never prerender or
// cache it, and never let a stale shell survive a deploy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Admin portal shell.
 *
 * Deliberately outside `app/(app)` so it inherits none of the user app: no
 * SyncProvider (no Dexie hydration of *your* budget), no TourProvider, no
 * 480px mobile frame, no bottom dock.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-[1180px] px-4 py-5 md:px-8 md:py-8">
        <header className="flex items-center justify-between gap-4 mb-6">
          <div>
            <div className="t-label-sm text-muted-foreground">AlloCat</div>
            <h1 className="t-title text-foreground">Admin</h1>
          </div>
          <div className="text-right">
            <div className="t-body-sm text-muted-foreground">{user.email}</div>
            <Link
              href="/dashboard"
              className="t-body-sm font-semibold text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
            >
              Back to app
            </Link>
          </div>
        </header>

        <div className="flex flex-col md:flex-row gap-6">
          <aside className="md:w-[190px] md:shrink-0">
            <AdminNav />
          </aside>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
