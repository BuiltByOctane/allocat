"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { notifyWhatsNew } from "@/lib/admin/whatsNew";
import { excerpt } from "@/lib/whats-new/format";
import type { WhatsNewEntry } from "@/lib/whats-new/types";

const field =
  "w-full rounded-tile bg-background px-3.5 py-2.5 t-body-sm border border-border outline-none focus:border-foreground/40";

/** Push an entry to every subscribed device, behind an explicit confirm step. */
export function WhatsNewNotify({
  entry,
  recipients,
  onDone,
}: {
  entry: WhatsNewEntry;
  recipients: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(`What's new: ${entry.title}`.slice(0, 80));
  const [body, setBody] = useState(excerpt(entry.body_md, 140) || "Tap to see what changed.");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await notifyWhatsNew(entry.id, { title, body });
      if ("error" in res) {
        setMsg(`✕ ${res.error}`);
        return;
      }
      setMsg(`✓ Sent ${res.sent} of ${res.recipients} devices.`);
      setConfirming(false);
      router.refresh();
    } catch (err) {
      setMsg(`✕ ${err instanceof Error ? err.message : "Push failed"}`);
    } finally {
      setBusy(false);
    }
  };

  const valid = title.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="flex flex-col gap-2 rounded-tile bg-tile p-3.5">
      <input
        className={field}
        value={title}
        maxLength={80}
        onChange={(e) => {
          setTitle(e.target.value);
          setConfirming(false);
        }}
        placeholder="Push title (≤80 chars)"
      />
      <textarea
        className={`${field} min-h-[70px] resize-y`}
        value={body}
        maxLength={200}
        onChange={(e) => {
          setBody(e.target.value);
          setConfirming(false);
        }}
        placeholder="Push body (≤200 chars)"
      />
      <div className="flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <span className="t-body-sm font-semibold">
              Send to {recipients} device{recipients === 1 ? "" : "s"}?
            </span>
            <Button size="sm" variant="lime" disabled={busy} loading={busy} onClick={send}>
              Confirm
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="lime" disabled={!valid || busy} onClick={() => setConfirming(true)}>
              Send push
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onDone}>
              Close
            </Button>
          </>
        )}
      </div>
      {msg && <p className="t-body-sm font-semibold">{msg}</p>}
    </div>
  );
}
