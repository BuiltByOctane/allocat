"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { Capacitor } from "@capacitor/core";
import { Bug, Lightbulb, MessageSquareText, CheckCircle2 } from "lucide-react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { submitFeedback, type FeedbackKind } from "@/lib/actions/feedback";

export interface FeedbackSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional starting kind (e.g. open straight into "bug"). */
  initialKind?: FeedbackKind;
}

// Mirrors the version surfaced in the Profile footer.
const APP_VERSION = "1.0.4";
const MAX_LEN = 2000;

const KINDS: { id: FeedbackKind; label: string; icon: typeof Bug }[] = [
  { id: "bug", label: "Bug", icon: Bug },
  { id: "feature", label: "Feature", icon: Lightbulb },
  { id: "feedback", label: "Feedback", icon: MessageSquareText },
];

const PLACEHOLDERS: Record<FeedbackKind, string> = {
  bug: "What went wrong? Steps to reproduce help a lot.",
  feature: "What would you love AlloCat to do?",
  feedback: "Tell us what you think — the good and the bad.",
};

export function FeedbackSheet({ isOpen, onClose, initialKind = "feedback" }: FeedbackSheetProps) {
  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card px-5 pt-3 pb-safe focus:outline-none max-w-[480px] mx-auto">
          <div className="flex justify-center pb-4 shrink-0">
            <div className="w-9 h-1 bg-border rounded-full" />
          </div>
          {/* Keyed on isOpen so all transient state (kind/message/success) resets
              cleanly each time the sheet reopens — no setState-in-effect needed. */}
          {isOpen && (
            <FeedbackBody key={String(isOpen)} initialKind={initialKind} onClose={onClose} />
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function FeedbackBody({
  initialKind,
  onClose,
}: {
  initialKind: FeedbackKind;
  onClose: () => void;
}) {
  const haptic = useHaptic();
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = message.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    haptic.medium();
    setSubmitting(true);
    setError(null);
    const res = await submitFeedback({
      kind,
      message: message.trim(),
      appVersion: APP_VERSION,
      platform: Capacitor.getPlatform(),
    });
    if ("error" in res) {
      haptic.error();
      setError(res.error);
      setSubmitting(false);
      return;
    }
    haptic.success();
    setDone(true);
    // Let the success state breathe, then close.
    setTimeout(() => onClose(), 1100);
  }

  if (done) {
    return (
      <div className="flex flex-col items-center text-center py-8">
        <div className="inline-flex items-center justify-center size-14 rounded-full bg-accent/15 mb-4">
          <CheckCircle2 className="text-accent" size={28} strokeWidth={2} />
        </div>
        <Drawer.Title className="font-display text-[22px] font-bold tracking-[-0.02em] text-foreground">
          Thank you!
        </Drawer.Title>
        <p className="text-sm text-muted-foreground mt-1.5">
          We read every message. It really helps.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-4 shrink-0">
        <Drawer.Title className="font-display text-[22px] font-bold tracking-[-0.02em] text-foreground">
          Send feedback
        </Drawer.Title>
        <Drawer.Description className="text-sm text-muted-foreground mt-1">
          Found a bug or have an idea? We&apos;d love to hear it.
        </Drawer.Description>
      </div>

      {/* Kind selector (segmented) */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {KINDS.map(({ id, label, icon: Icon }) => {
          const active = kind === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                haptic.selection();
                setKind(id);
              }}
              aria-pressed={active}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 transition-all active:scale-[0.98] ${
                active
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              <Icon size={18} strokeWidth={1.9} className={active ? "text-accent-strong" : ""} />
              <span className="text-[12.5px] font-semibold">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Message */}
      <label className="flex flex-col gap-1.5 mb-4">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
          maxLength={MAX_LEN}
          rows={4}
          required
          placeholder={PLACEHOLDERS[kind]}
          className="w-full resize-none bg-background border border-border rounded-2xl px-3.5 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground placeholder:font-normal focus:outline-none focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40 transition-colors"
        />
        <span className="self-end text-[10px] font-semibold tabular-nums text-muted-foreground">
          {message.length}/{MAX_LEN}
        </span>
      </label>

      {error && (
        <div className="rounded-[13px] border border-neg/30 bg-neg/5 px-4 py-3 text-sm font-medium text-neg mb-3">
          {error}
        </div>
      )}

      {/* CTA */}
      <div className="flex flex-col gap-3 pb-6 shrink-0">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="w-full py-3.5 bg-accent text-accent-ink font-bold rounded-pill active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          {submitting ? "Sending…" : "Send feedback"}
        </button>
        <button
          type="button"
          onClick={() => {
            haptic.light();
            onClose();
          }}
          className="w-full py-3 text-muted-foreground font-semibold rounded-pill active:scale-[0.98] transition-all"
        >
          Not now
        </button>
      </div>
    </>
  );
}

export default FeedbackSheet;
