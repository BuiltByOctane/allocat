import { requireAdmin } from "@/lib/admin/guard";
import { listWaitlist } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

/** Quote every cell; a leading =,+,-,@ is neutralised so Excel won't run it as a formula. */
function cell(v: string | null): string {
  const s = v ?? "";
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** GET → every iOS waitlist signup as CSV, newest first. */
export async function GET() {
  await requireAdmin();
  const { rows } = await listWaitlist({ limit: null });

  const lines = [
    "email,preference,source,platform,created_at",
    ...rows.map((r) => [r.email, r.preference, r.source, r.platform, r.created_at].map(cell).join(",")),
  ];
  const day = new Date().toISOString().slice(0, 10);

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ios-waitlist-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
