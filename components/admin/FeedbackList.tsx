"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { setFeedbackResolved } from "@/lib/admin/actions";
import type { FeedbackRow } from "@/lib/admin/queries";
import { ago } from "@/lib/admin/format";

const KIND_TONE: Record<string, string> = {
  bug: "bg-[var(--neg-dim)] text-neg",
  feature: "bg-[var(--pos-dim)] text-pos",
  feedback: "bg-tile text-muted-foreground",
};

export function FeedbackList({ rows }: { rows: FeedbackRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  if (rows.length === 0) {
    return <p className="t-body-sm text-muted-foreground">Inbox is clear.</p>;
  }

  const toggle = (row: FeedbackRow) => {
    setBusy(row.id);
    startTransition(async () => {
      await setFeedbackResolved(row.id, row.resolved_at === null);
      setBusy(null);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {rows.map((f) => (
        <div key={f.id} className="rounded-card bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className={`rounded-pill px-2.5 py-1 t-micro ${KIND_TONE[f.kind] ?? KIND_TONE.feedback}`}>
                {f.kind}
              </span>
              {f.platform && (
                <span className="rounded-pill bg-tile text-muted-foreground px-2.5 py-1 t-micro">{f.platform}</span>
              )}
              {f.app_version && (
                <span className="rounded-pill bg-tile text-muted-foreground px-2.5 py-1 t-micro font-mono">
                  v{f.app_version}
                </span>
              )}
              <span className="t-body-sm text-muted-foreground">{ago(f.created_at)}</span>
            </div>
            <Button
              size="sm"
              variant={f.resolved_at ? "ghost" : "outline"}
              disabled={pending && busy === f.id}
              onClick={() => toggle(f)}
            >
              {f.resolved_at ? "Reopen" : "Resolve"}
            </Button>
          </div>
          <p className="t-body whitespace-pre-wrap">{f.message}</p>
          <Link
            href={`/admin/users/${f.user_id}`}
            className="t-body-sm text-muted-foreground font-mono hover:text-foreground mt-2 inline-block"
          >
            {f.user_id}
          </Link>
        </div>
      ))}
    </div>
  );
}
