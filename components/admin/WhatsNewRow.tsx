"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TagPill } from "@/components/whats-new/TagPill";
import { WhatsNewEditor } from "@/components/admin/WhatsNewEditor";
import { WhatsNewNotify } from "@/components/admin/WhatsNewNotify";
import { deleteWhatsNewEntry } from "@/lib/admin/whatsNew";
import { ago, date } from "@/lib/admin/format";
import type { WhatsNewEntry } from "@/lib/whats-new/types";

/** One changelog entry in the admin list: summary plus inline edit / notify. */
export function WhatsNewRow({ entry, recipients }: { entry: WhatsNewEntry; recipients: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "notify">("view");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const remove = async () => {
    if (!window.confirm(`Delete "${entry.title}"? This cannot be undone.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await deleteWhatsNewEntry(entry.id);
      if ("error" in res) setMsg(`✕ ${res.error}`);
      else router.refresh();
    } catch (err) {
      setMsg(`✕ ${err instanceof Error ? err.message : "Delete failed"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="t-body-sm font-semibold">{entry.title}</span>
          {entry.tags.map((t) => (
            <TagPill key={t} tag={t} />
          ))}
        </div>
        <span className="t-body-sm text-muted-foreground font-mono">
          {date(entry.published_at)} · {entry.notified_at ? `Notified ${ago(entry.notified_at)}` : "Not notified"}
        </span>
      </div>

      {mode === "view" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setMsg(null);
              setMode("edit");
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setMsg(null);
              setMode("notify");
            }}
          >
            Notify
          </Button>
          <Button size="sm" variant="danger" disabled={busy} loading={busy} onClick={remove}>
            Delete
          </Button>
          {msg && <p className="t-body-sm font-semibold">{msg}</p>}
        </div>
      )}
      {mode === "edit" && <WhatsNewEditor entry={entry} onDone={() => setMode("view")} />}
      {mode === "notify" && (
        <WhatsNewNotify
          entry={entry}
          recipients={recipients}
          onDone={(result) => {
            setMsg(result ?? null);
            setMode("view");
          }}
        />
      )}
    </div>
  );
}
