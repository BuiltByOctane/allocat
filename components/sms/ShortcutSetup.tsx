"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Copy, ExternalLink, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDrawer } from "@/components/ui/ConfirmDrawer";
import {
  createShortcutKey,
  revokeShortcutKey,
  getShortcutKeyStatus,
} from "@/lib/actions/shortcut-keys";
import type { ShortcutKeyStatus } from "@/lib/server/shortcut-keys";
import {
  IOS_SHORTCUT_URL,
  IOS_GUIDE_PATH,
  IOS_SHORTCUT_NAME,
  IOS_KEYWORDS,
} from "@/lib/shortcut/config";
import { IOS_SHORTCUT_LS_KEY } from "@/components/pwa/ShortcutReconciler";
import { track } from "@/lib/analytics/client";
import { getWebPushState, enableWebPush, type WebPushState } from "@/lib/push/webPush";

const POLL_MS = 4000;

function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function rememberSetup(active: boolean) {
  try {
    if (active) window.localStorage.setItem(IOS_SHORTCUT_LS_KEY, "1");
    else window.localStorage.removeItem(IOS_SHORTCUT_LS_KEY);
  } catch {
    /* storage unavailable — the reconciler just stays off */
  }
}

/**
 * Copy text that is still being fetched. Safari only allows a clipboard write
 * inside the tap that caused it, and awaiting the server action first loses
 * that. Handing ClipboardItem a promise keeps the write inside the gesture.
 */
async function copyPending(text: Promise<string>): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })),
        }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(await text);
    return true;
  } catch {
    return false;
  }
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-tile text-[12px] font-bold text-foreground">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[13px] font-bold text-foreground">{title}</p>
        <div className="text-xs leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

/**
 * iPhone SMS auto-capture setup, shown on /sms for iOS web/PWA users.
 *
 * iOS lets no app read SMS, but a Shortcuts "Message" automation can POST a
 * bank SMS to /api/shortcut/sms. This card mints the user's key, links the
 * shared shortcut, and shows whether it has connected. The full walkthrough
 * with screenshots lives on the public guide page.
 */
export function ShortcutSetup({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [status, setStatus] = useState<ShortcutKeyStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"regenerate" | "revoke" | null>(null);
  const [push, setPush] = useState<WebPushState | null>(null);
  const [standalone, setStandalone] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await getShortcutKeyStatus();
      setStatus(s);
      setLoadError(false);
      rememberSetup(s.active);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void getWebPushState().then(setPush);
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true,
    );
  }, [refresh]);

  async function turnOnPush() {
    setError(null);
    try {
      setPush(await enableWebPush());
    } catch {
      setError("Couldn't turn on notifications. Try again.");
    }
  }

  const connected = Boolean(status?.active && status.lastUsedAt);

  // Waiting for the first ▶ test run: poll so the card flips to "Connected"
  // while the user is still in the Shortcuts app.
  useEffect(() => {
    if (!open || !status?.active || connected) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [open, status?.active, connected, refresh]);

  async function makeKey() {
    setBusy(true);
    setError(null);
    setCopied(false);
    track("shortcut_key_created");
    const keyPromise = createShortcutKey().then((r) => r.key);
    // Start the copy inside the tap; it resolves once the key arrives.
    const copyPromise = copyPending(keyPromise);
    try {
      const k = await keyPromise;
      setKey(k);
      setCopied(await copyPromise);
      rememberSetup(true);
      await refresh();
    } catch {
      setError("Couldn't create a key. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyAgain() {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      await revokeShortcutKey();
      setKey(null);
      rememberSetup(false);
      await refresh();
    } catch {
      setError("Couldn't turn it off. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const summary = !status
    ? loadError
      ? "Connect to the internet to set this up"
      : "Checking…"
    : connected
      ? status.lastCaptureAt
        ? `Connected · last spend ${timeAgo(status.lastCaptureAt)}`
        : "Connected · waiting for your next bank SMS"
      : status.active
        ? "Key created · finish the steps below"
        : "Log spends from bank SMS automatically";

  return (
    <Card className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          if (!open) track("shortcut_setup_opened");
          setOpen((o) => !o);
        }}
        className="flex items-center gap-3 text-left"
        aria-expanded={open}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-tile text-foreground">
          <Smartphone size={20} strokeWidth={1.8} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-bold text-foreground">iPhone auto-capture</span>
          <span
            className={`text-xs ${connected ? "text-pos font-semibold" : "text-muted-foreground"}`}
          >
            {summary}
          </span>
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            iPhones don&apos;t let apps read SMS, but Apple&apos;s Shortcuts app can. Set it
            up once and every bank debit SMS lands here on its own. The message is read to
            find the amount and merchant, then thrown away.
          </p>

          <ol className="flex flex-col gap-4">
            <Step n={1} title="Get your key">
              {key ? (
                <div className="flex flex-col gap-2">
                  <code className="block break-all rounded-xl border border-border bg-background px-3 py-2 font-mono text-[11px] text-foreground">
                    {key}
                  </code>
                  <Button size="sm" variant="outline" onClick={copyAgain}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy key"}
                  </Button>
                  <span>
                    This key is shown once. It can only add spends to your account, never read
                    them. Don&apos;t share it.
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {status?.active && (
                    <span>
                      You already have a key ({status.prefix}…). Making a new one switches the
                      old one off, so you&apos;ll paste the new one into the shortcut.
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant={status?.active ? "outline" : "lime"}
                    loading={busy}
                    disabled={busy || !status}
                    onClick={() => (status?.active ? setConfirm("regenerate") : void makeKey())}
                  >
                    {status?.active ? "Make a new key" : "Create & copy my key"}
                  </Button>
                </div>
              )}
            </Step>

            <Step n={2} title="Add the shortcut and paste your key">
              <div className="flex flex-col gap-2">
                {IOS_SHORTCUT_URL ? (
                  // Plain anchor, new tab: iCloud hands off to the Shortcuts app,
                  // and the installed PWA stays where it was.
                  <a
                    href={IOS_SHORTCUT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-pill bg-[var(--pill)] px-4 text-[13px] font-bold text-[var(--pill-foreground)] active:scale-[0.98]"
                  >
                    <ExternalLink size={14} />
                    Add “{IOS_SHORTCUT_NAME}” shortcut
                  </a>
                ) : (
                  <span className="font-semibold text-foreground">
                    The shortcut link is coming soon.
                  </span>
                )}
                <span>
                  Tap <b>Add Shortcut</b>. Then in Shortcuts, tap <b>•••</b> on “
                  {IOS_SHORTCUT_NAME}”, tap the text <b>PASTE-YOUR-ALLOCAT-KEY-HERE</b>, select
                  all and <b>Paste</b>.
                </span>
              </div>
            </Step>

            <Step n={3} title="Test it once">
              Tap ▶ on “{IOS_SHORTCUT_NAME}” and choose <b>Always Allow</b> for allocat.xyz. You
              should see “AlloCat is connected”, and this card turns green.
            </Step>

            <Step n={4} title="Turn on AlloCat notifications">
              {push === "on" ? (
                <span className="font-semibold text-pos">
                  ✓ On. Tapping a spend notification opens AlloCat.
                </span>
              ) : push === "off" ? (
                <div className="flex flex-col gap-2">
                  <span>
                    So tapping a spend notification opens AlloCat, right at the transaction.
                  </span>
                  <Button size="sm" variant="outline" onClick={turnOnPush}>
                    Turn on notifications
                  </Button>
                </div>
              ) : push === "denied" ? (
                <span>
                  Notifications are blocked. Turn them on in iPhone Settings → Notifications →
                  AlloCat.
                </span>
              ) : standalone ? (
                <span>Notifications need iOS 16.4 or later.</span>
              ) : (
                <span>
                  Add AlloCat to your Home Screen first (Share → <b>Add to Home Screen</b>), open
                  it from there and come back here. Until then, spend notifications come from
                  Shortcuts and open the Shortcuts app when tapped.
                </span>
              )}
            </Step>

            <Step n={5} title="Create the automation">
              Shortcuts → <b>Automation</b> → <b>+</b> → <b>Message</b> → Message Contains{" "}
              <b>{IOS_KEYWORDS[0].word}</b> → <b>Run Immediately</b> → Next → pick “
              {IOS_SHORTCUT_NAME}”. Repeat with <b>{IOS_KEYWORDS[1].word}</b>. Leave Sender
              empty — iOS often fails to match bank sender IDs.
            </Step>
          </ol>

          {error && (
            <p role="alert" className="rounded-xl border border-neg/30 bg-neg/10 px-3 py-2 text-xs font-medium text-neg">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={IOS_GUIDE_PATH}
              className="text-xs font-bold text-foreground underline underline-offset-4 decoration-border"
            >
              Full guide with screenshots →
            </Link>
            {status?.active && (
              <button
                type="button"
                onClick={() => setConfirm("revoke")}
                className="text-xs font-bold text-neg"
              >
                Turn off
              </button>
            )}
          </div>
        </div>
      )}

      <ConfirmDrawer
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm;
          setConfirm(null);
          if (action === "regenerate") void makeKey();
          if (action === "revoke") void revoke();
        }}
        title={confirm === "revoke" ? "Turn off iPhone auto-capture?" : "Make a new key?"}
        description={
          confirm === "revoke"
            ? "Your shortcut stops working right away. You can also delete the automation in the Shortcuts app."
            : "Your current key stops working. You'll need to paste the new key into the shortcut."
        }
        confirmText={confirm === "revoke" ? "Turn off" : "Make new key"}
      />
    </Card>
  );
}
