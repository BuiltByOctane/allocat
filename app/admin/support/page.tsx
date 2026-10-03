import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { listFeedback, listFoundingMembers } from "@/lib/admin/queries";
import { FeedbackList } from "@/components/admin/FeedbackList";
import { FoundingMemberList } from "@/components/admin/FoundingMemberList";

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; resolved?: string }>;
}) {
  await requireAdmin();
  const { tab = "feedback", resolved } = await searchParams;
  const showFounding = tab === "founding";
  const includeResolved = resolved === "1";

  const [feedback, founding] = await Promise.all([
    showFounding ? Promise.resolve([]) : listFeedback(includeResolved),
    showFounding ? listFoundingMembers() : Promise.resolve(null),
  ]);

  const tabClass = (active: boolean) =>
    [
      "rounded-pill px-4 py-2 t-body-sm font-bold",
      active ? "bg-[var(--pill)] text-[var(--pill-foreground)]" : "bg-card text-muted-foreground hover:text-foreground",
    ].join(" ");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/support" className={tabClass(!showFounding)}>
          Feedback
        </Link>
        <Link href="/admin/support?tab=founding" className={tabClass(showFounding)}>
          Founding members
        </Link>
        {!showFounding && (
          <Link
            href={includeResolved ? "/admin/support" : "/admin/support?resolved=1"}
            className="ml-auto t-body-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            {includeResolved ? "Hide resolved" : "Show resolved"}
          </Link>
        )}
      </div>

      {founding ? <FoundingMemberList data={founding} /> : <FeedbackList rows={feedback} />}
    </div>
  );
}
