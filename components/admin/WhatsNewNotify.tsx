"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { notifyWhatsNew } from "@/lib/admin/whatsNew";
import { ago } from "@/lib/admin/format";
import { pushDefaults } from "@/lib/whats-new/format";
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
  /** Closes the panel; on a successful send it carries the result line to show. */
  onDone: (result?: string) => void;
}) {
  const router = useRouter();
  const defaults = pushDefaults(entry);
  const [pick, setPick] = useState(0);
  const [title, setTitle] = useState(defaults.title);
  const [body, setBody] = useState(defaults.body.slice(0, 200));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // State updates are async; a ref closes the double-click window on Confirm.
  const inFlight = useRef(false);

  const send = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const res = await notifyWhatsNew(entry.id, { title, body });
      if ("error" in res) {
        setMsg(`✕ ${res.error}`);
        return;
      }
      const line = `✓ Sent ${res.sent} of ${res.recipients} devices.`;
      router.refresh();
      onDone(res.warning ? `${line} ⚠ ${res.warning}` : line);
    } catch (err) {
      setMsg(`✕ ${err instanceof Error ? err.message : "Push failed"}`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const devices = `${recipients} device${recipients === 1 ? "" : "s"}`;

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
              {entry.notified_at
                ? `Already notified ${ago(entry.notified_at)} — send again to ${devices}?`
                : `Send to ${devices}?`}
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
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                const next = pick + 1;
                setPick(next);
                setTitle(pushDefaults(entry, next).title);
                setConfirming(false);
              }}
            >
              Another line
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDone()}>
              Close
            </Button>
          </>
        )}
      </div>
      {msg && <p className="t-body-sm font-semibold">{msg}</p>}
    </div>
  );
}
