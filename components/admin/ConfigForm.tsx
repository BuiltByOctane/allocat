"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { saveAppConfig } from "@/lib/admin/actions";
import type { AppFlags } from "@/lib/config/flags";

const FLAG_COPY: Record<keyof AppFlags, { label: string; hint: string }> = {
  ai_enabled: {
    label: "AI chat",
    hint: "Off returns 503 from /api/ai/chat. Use if OpenRouter spend runs away.",
  },
  sms_enabled: {
    label: "SMS tracking",
    hint: "Off unmounts the SMS bridge: no live ingest, no queue drain, no rule mirror.",
  },
  support_cta_native: {
    label: "Ko-fi button on Android",
    hint: "Off hides the donate button inside the native shell (Play-review escape hatch).",
  },
  daily_ai_messages: {
    label: "Daily AI messages",
    hint: "Per-account ceiling, counted in Postgres.",
  },
};

export function ConfigForm({
  initial,
}: {
  initial: { minAndroidVersionCode: number; updateMessage: string | null; flags: AppFlags };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flags, setFlags] = useState<AppFlags>(initial.flags);
  const [minCode, setMinCode] = useState(String(initial.minAndroidVersionCode));
  const [message, setMessage] = useState(initial.updateMessage ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  const save = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await saveAppConfig({
        minAndroidVersionCode: Number(minCode) || 0,
        updateMessage: message,
        flags,
      });
      setMsg("error" in res ? `✕ ${res.error}` : "✓ Saved — live within 60s");
      if (!("error" in res)) router.refresh();
    });
  };

  const field =
    "rounded-tile bg-background px-3.5 py-2.5 t-body-sm border border-border outline-none focus:border-foreground/40";

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-card bg-card p-5 flex flex-col gap-3">
        <h2 className="t-label text-muted-foreground">Kill switches</h2>
        {(Object.keys(FLAG_COPY) as Array<keyof AppFlags>).map((key) => {
          const copy = FLAG_COPY[key];
          const value = flags[key];
          return (
            <div key={key} className="flex items-start justify-between gap-4 border-t border-border pt-3 first:border-0 first:pt-0">
              <div className="min-w-0">
                <div className="t-body-sm font-semibold">{copy.label}</div>
                <p className="t-body-sm text-muted-foreground">{copy.hint}</p>
              </div>
              {typeof value === "boolean" ? (
                <button
                  type="button"
                  onClick={() => setFlags((f) => ({ ...f, [key]: !value }))}
                  className={[
                    "shrink-0 rounded-pill px-3.5 py-2 t-body-sm font-bold",
                    value ? "bg-accent text-[var(--accent-ink)]" : "bg-[var(--neg-dim)] text-neg",
                  ].join(" ")}
                >
                  {value ? "On" : "Off"}
                </button>
              ) : (
                <input
                  type="number"
                  min={1}
                  value={value}
                  onChange={(e) =>
                    setFlags((f) => ({ ...f, [key]: Math.max(1, Number(e.target.value) || 1) }))
                  }
                  className={`${field} w-20 shrink-0 font-mono text-right`}
                />
              )}
            </div>
          );
        })}
      </section>

      <section className="rounded-card bg-card p-5 flex flex-col gap-3">
        <h2 className="t-label text-muted-foreground">Android force-update</h2>
        <p className="t-body-sm text-muted-foreground">
          Builds with a lower <span className="font-mono">versionCode</span> are hard-blocked by
          ForceUpdateGate. Set to 0 to disable.
        </p>
        <input
          className={`${field} font-mono`}
          type="number"
          min={0}
          value={minCode}
          onChange={(e) => setMinCode(e.target.value)}
          placeholder="min versionCode"
        />
        <textarea
          className={`${field} min-h-[80px] resize-y`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message shown on the block screen (optional)"
        />
      </section>

      <div className="flex items-center gap-3">
        <Button variant="lime" disabled={pending} loading={pending} onClick={save}>
          Save config
        </Button>
        {msg && <span className="t-body-sm font-semibold">{msg}</span>}
      </div>
    </div>
  );
}
