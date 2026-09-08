"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { linkSupporterToUser } from "@/lib/admin/actions";
import type { SupporterRow } from "@/lib/admin/queries";
import { date } from "@/lib/admin/format";

/**
 * Ko-fi ledger. The interesting rows are the unlinked ones — someone donated
 * with an address that never became an account, so the cosmetic badge never
 * reached them. Paste the account's user id to fix it by hand.
 */
export function SupporterList({ rows }: { rows: SupporterRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  if (rows.length === 0) {
    return <p className="t-body-sm text-muted-foreground">No donations recorded yet.</p>;
  }

  const link = (email: string) => {
    const userId = (draft[email] ?? "").trim();
    if (!userId) return;
    setMsg(null);
    startTransition(async () => {
      const res = await linkSupporterToUser(email, userId);
      setMsg("error" in res ? `✕ ${res.error}` : `✓ Linked ${email}`);
      if (!("error" in res)) router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {msg && <p className="t-body-sm font-semibold">{msg}</p>}
      {rows.map((s) => (
        <div key={s.email} className="rounded-card bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="t-body-sm font-semibold font-mono truncate">{s.email}</div>
              <div className="t-body-sm text-muted-foreground">
                {s.currency ?? ""} {s.total_amount} · first {date(s.first_supported_at)} · last{" "}
                {date(s.last_supported_at)} · {s.source}
              </div>
            </div>
            {s.user_id ? (
              <Link
                href={`/admin/users/${s.user_id}`}
                className="t-body-sm font-mono text-muted-foreground hover:text-foreground"
              >
                linked →
              </Link>
            ) : (
              <span className="rounded-pill bg-[var(--warn-dim)] text-warn px-2.5 py-1 t-micro">unlinked</span>
            )}
          </div>

          {!s.user_id && (
            <div className="flex flex-wrap gap-2 mt-3">
              <input
                value={draft[s.email] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [s.email]: e.target.value }))}
                placeholder="user id to link"
                className="flex-1 min-w-[240px] rounded-pill bg-background px-4 py-2 t-body-sm font-mono border border-border outline-none focus:border-foreground/40"
              />
              <Button size="sm" variant="outline" disabled={pending} onClick={() => link(s.email)}>
                Link
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
