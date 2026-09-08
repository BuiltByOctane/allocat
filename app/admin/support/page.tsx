import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { listFeedback, listSupporters } from "@/lib/admin/queries";
import { FeedbackList } from "@/components/admin/FeedbackList";
import { SupporterList } from "@/components/admin/SupporterList";

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; resolved?: string }>;
}) {
  await requireAdmin();
  const { tab = "feedback", resolved } = await searchParams;
  const showSupporters = tab === "supporters";
  const includeResolved = resolved === "1";

  const [feedback, supporters] = await Promise.all([
    showSupporters ? Promise.resolve([]) : listFeedback(includeResolved),
    showSupporters ? listSupporters() : Promise.resolve([]),
  ]);

  const tabClass = (active: boolean) =>
    [
      "rounded-pill px-4 py-2 t-body-sm font-bold",
      active ? "bg-[var(--pill)] text-[var(--pill-foreground)]" : "bg-card text-muted-foreground hover:text-foreground",
    ].join(" ");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/support" className={tabClass(!showSupporters)}>
          Feedback
        </Link>
        <Link href="/admin/support?tab=supporters" className={tabClass(showSupporters)}>
          Supporters
        </Link>
        {!showSupporters && (
          <Link
            href={includeResolved ? "/admin/support" : "/admin/support?resolved=1"}
            className="ml-auto t-body-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            {includeResolved ? "Hide resolved" : "Show resolved"}
          </Link>
        )}
      </div>

      {showSupporters ? <SupporterList rows={supporters} /> : <FeedbackList rows={feedback} />}
    </div>
  );
}
