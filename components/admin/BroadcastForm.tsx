"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

const SEGMENTS = [
  { id: "all", label: "Everyone", hint: "Every subscribed device" },
  { id: "android", label: "Android", hint: "Last opened the native shell" },
  { id: "web", label: "Web / PWA", hint: "Never opened the native shell" },
  { id: "supporters", label: "Supporters", hint: "Donated via Ko-fi" },
  { id: "inactive_7d", label: "Inactive 7d", hint: "Not seen in the last week" },
];

/**
 * Compose + send a push campaign.
 *
 * Two deliberate brakes, because this is the one screen that can annoy every
 * user at once: a test send to yourself is required first, and the real send
 * needs the segment name typed out.
 */
export function BroadcastForm() {
  const router = useRouter();
  const [segment, setSegment] = useState("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/dashboard");
  const [reach, setReach] = useState<{ total: number; web: number; android: number } | null>(null);
  const [tested, setTested] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Recipient count is advisory; a stale number never gates the send itself.
  useEffect(() => {
    let cancelled = false;
    setReach(null);
    fetch(`/api/admin/broadcast?segment=${segment}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setReach({ total: d.recipients, web: d.web, android: d.android });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [segment]);

  // Any edit invalidates the test — you must preview what you're actually sending.
  useEffect(() => {
    setTested(false);
    setConfirm("");
  }, [title, body, url, segment]);

  const post = async (test: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment, title, body, url, test }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`✕ ${data.error ?? res.statusText}`);
        return;
      }
      if (test) {
        // Unlock either way — an admin with no subscription of their own must
        // still be able to broadcast — but never claim delivery that did not
        // happen. notifyUser reports 0 rather than throwing.
        setTested(true);
        if (data.sent > 0) {
          const parts = [];
          if (data.android?.sent) parts.push(`${data.android.sent} Android`);
          if (data.web?.sent) parts.push(`${data.web.sent} browser`);
          setMsg(`✓ Test delivered to ${parts.join(" + ")}. Check it, then send for real.`);
        } else if (data.skipped === "no_subscriptions") {
          setMsg(
            "⚠ None of your own devices are registered, so there was nothing to deliver to. Open the Android app, or enable notifications in a browser, to preview. Sending is still unlocked.",
          );
        } else if (data.skipped === "vapid_unconfigured") {
          setMsg("✕ Push is not configured on this deploy — no VAPID keys and no FCM.");
          setTested(false);
        } else {
          setMsg(`⚠ Delivered to 0 of ${data.subscriptions} device(s). Sending is still unlocked.`);
        }
      } else {
        setMsg(
          `✓ Sent ${data.sent} · failed ${data.failed} · of ${data.recipients} devices` +
            (data.android ? ` (${data.android.sent} Android, ${data.web?.sent ?? 0} browser)` : ""),
        );
        setTitle("");
        setBody("");
        router.refresh();
      }
    } catch (err) {
      setMsg(`✕ ${err instanceof Error ? err.message : "Request failed"}`);
    } finally {
      setBusy(false);
    }
  };

  const canSend = tested && confirm.trim() === segment && !busy && title && body;
  const field =
    "w-full rounded-tile bg-background px-3.5 py-2.5 t-body-sm border border-border outline-none focus:border-foreground/40";

  return (
    <div className="rounded-card bg-card p-5 flex flex-col gap-4">
      <div>
        <div className="t-label-sm text-muted-foreground mb-2">Segment</div>
        <div className="flex flex-wrap gap-2">
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.hint}
              onClick={() => setSegment(s.id)}
              className={[
                "rounded-pill px-3.5 py-2 t-body-sm font-bold",
                segment === s.id
                  ? "bg-[var(--pill)] text-[var(--pill-foreground)]"
                  : "bg-tile text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="t-body-sm text-muted-foreground mt-2">
          {reach === null
            ? "Counting devices…"
            : `${reach.total} device${reach.total === 1 ? "" : "s"} will receive this — ` +
              `${reach.android} Android app, ${reach.web} browser/PWA.`}
        </p>
        <p className="t-body-sm text-muted-foreground mt-1">
          Counts devices, not people: someone with the app and a laptop browser is reached twice.
          Only devices that granted notification permission appear here.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <input
          className={field}
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (≤80 chars)"
        />
        <textarea
          className={`${field} min-h-[90px] resize-y`}
          value={body}
          maxLength={300}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Body (≤300 chars)"
        />
        <input
          className={field}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Open on tap (path, e.g. /dashboard)"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy || !title || !body} onClick={() => post(true)}>
          Send test to me
        </Button>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={tested ? `type "${segment}" to confirm` : "test first"}
          disabled={!tested}
          className={`${field} flex-1 min-w-[200px] disabled:opacity-40`}
        />
        <Button size="sm" variant="lime" disabled={!canSend} onClick={() => post(false)}>
          Send broadcast
        </Button>
      </div>

      {msg && <p className="t-body-sm font-semibold">{msg}</p>}
    </div>
  );
}
