"use client";

import type { ReactNode } from "react";
import PawLogo from "@/components/ai/PawLogo";
import { Button } from "@/components/ui/Button";

interface AuthShellProps {
  /** Tiny uppercase eyebrow above the title (e.g. "Sign in"). */
  eyebrow: string;
  title: string;
  subtitle: string;
  /** The form rows. */
  children: ReactNode;
  /** Sticky bottom region — primary CTA, OAuth, divider. */
  footer: ReactNode;
  /** Bottom-most switch line (e.g. "Don't have an account? Create one"). */
  switchPrompt: string;
  switchHref: string;
  switchCta: string;
}

/**
 * Responsive auth scaffold.
 *
 * Mobile: full-bleed, app-like — a branded lime hero that bleeds to the edges,
 * a scrollable form body, and a sticky bottom dock so the CTA sits in the thumb
 * zone, the way a native sign-in screen behaves.
 *
 * Desktop (md+): the same content collapses into a centered, contained card
 * (border + shadow) — the sticky dock becomes a normal inline footer — so it
 * reads as a proper web sign-in page instead of a stretched mobile screen.
 *
 * Uses the Neo·Lime accent tokens so it tracks the active accent + light/dark.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  switchPrompt,
  switchHref,
  switchCta,
}: AuthShellProps) {
  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col bg-background text-foreground md:items-center md:justify-center md:px-6 md:py-10">
      {/* Card wrapper — full-bleed on mobile, contained card on desktop */}
      <div className="flex min-h-[100dvh] w-full flex-col md:min-h-0 md:max-w-[440px] md:overflow-hidden md:rounded-card md:border md:border-border md:bg-background md:shadow-[0_30px_80px_-40px_rgba(0,0,0,0.45)]">
        {/* Branded hero — full-bleed, wordmark watermark, soft fade into the page */}
        <header className="relative overflow-hidden bg-accent px-6 pb-10 pt-[calc(env(safe-area-inset-top)+2.75rem)] text-[var(--accent-ink)] md:pb-8 md:pt-9">
          {/* Oversized watermark glyph for depth */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-10 select-none font-display text-[180px] font-black leading-none opacity-[0.08]"
            style={{ color: "var(--accent-ink)" }}
          >
            ₹
          </span>
          {/* Bottom feather so the lime melts into the background */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
            style={{
              background:
                "linear-gradient(to bottom, transparent, var(--background))",
            }}
          />

          <div className="relative flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-[var(--accent-ink)]/12 backdrop-blur-sm">
              <PawLogo size={34} priority className="h-[34px] w-[34px]" />
            </div>
            <span className="font-display text-[20px] font-extrabold tracking-[-0.03em]">
              AlloCat
            </span>
          </div>

          <div className="relative mt-9 md:mt-7">
            <p className="t-label opacity-70">{eyebrow}</p>
            <h1 className="mt-2 max-w-[14ch] font-display text-[34px] font-black leading-[0.98] tracking-[-0.04em] md:text-[30px]">
              {title}
            </h1>
            <p className="mt-2.5 max-w-[34ch] text-[13.5px] font-medium leading-relaxed opacity-75">
              {subtitle}
            </p>
          </div>
        </header>

        {/* Scrollable form body */}
        <main className="flex-1 px-6 pb-6 pt-7 md:flex-none md:pt-6">
          <div className="mx-auto w-full max-w-[420px]">{children}</div>
        </main>

        {/* Bottom dock — sticky/thumb-zone on mobile, inline footer on desktop */}
        <div className="sticky bottom-0 z-10 border-t border-border bg-background/85 px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] backdrop-blur-md md:static md:border-t-0 md:bg-transparent md:pb-6 md:backdrop-blur-none">
          <div className="mx-auto w-full max-w-[420px]">
            {footer}

            {/* Switch — a real button, not a bare text link */}
            <div className="mt-5 flex flex-col items-center gap-2">
              <p className="text-[13px] text-muted-foreground">{switchPrompt}</p>
              <Button href={switchHref} variant="outline" size="md" block>
                {switchCta}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shared native-style stacked input row with a label. */
export function AuthField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="t-label text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export const authInputClass =
  "w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-[15px] font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground transition-colors focus:border-[var(--accent-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40";

export default AuthShell;
