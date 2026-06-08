"use client";

import Link from "next/link";
import { useState } from "react";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { signup } from "@/lib/actions/auth";
import { useHaptic } from "@/lib/hooks/useHaptic";
import PawLogo from "@/components/ai/PawLogo";
import { Button } from "@/components/ui/Button";

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const haptic = useHaptic();

  async function handleSubmit(formData: FormData) {
    haptic.light();
    setIsPending(true);
    setErrorMsg(null);
    const res = await signup(formData);
    if (res?.error) {
      haptic.error();
      setErrorMsg(res.error);
      setIsPending(false);
    } else {
      haptic.success();
    }
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-[380px]">
        <div className="rounded-card bg-card p-6 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.25)]">
          {/* Brand */}
          <div className="flex flex-col items-center text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-accent">
              <PawLogo size={36} priority className="h-9 w-9" />
            </div>
            <p className="mt-4 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              Create Account
            </p>
            <h1 className="mt-2 font-display text-[26px] font-bold tracking-[-0.03em] text-foreground">
              Start tracking
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Create an account to take control of your finances.
            </p>
          </div>

          <form action={handleSubmit} className="mt-7 flex flex-col gap-5">
            {errorMsg && (
              <div className="rounded-[13px] border border-neg/30 bg-neg/5 px-4 py-3 text-sm font-medium text-neg">
                {errorMsg}
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                Full Name
              </span>
              <input
                name="full_name"
                type="text"
                required
                autoComplete="name"
                className="w-full bg-card border border-border rounded-[13px] px-3.5 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground placeholder:font-normal focus:outline-none focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40 transition-colors"
                placeholder="John Doe"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                Email Address
              </span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full bg-card border border-border rounded-[13px] px-3.5 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground placeholder:font-normal focus:outline-none focus:border-[var(--accent-strong)] focus:ring-2 focus:ring-[var(--accent)]/40 transition-colors"
                placeholder="name@example.com"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                Password
              </span>
              <div className="flex items-stretch bg-card border border-border rounded-[13px] focus-within:border-[var(--accent-strong)] focus-within:ring-2 focus-within:ring-[var(--accent)]/40 transition-colors">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="flex-1 bg-transparent rounded-[13px] px-3.5 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground placeholder:font-normal focus:outline-none"
                  placeholder="Create a secure password"
                />
                <button
                  type="button"
                  onClick={() => {
                    haptic.light();
                    setShowPassword(!showPassword);
                  }}
                  className="px-3 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground mt-0.5">
                Min 6 characters
              </span>
            </label>

            <Button
              type="submit"
              variant="primary"
              block
              loading={isPending}
              className="mt-1 h-[48px]"
            >
              {isPending ? "Creating account…" : "Create Account"}
            </Button>
          </form>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              or continue with
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <OAuthButtons />
        </div>

        <p className="text-center text-muted-foreground text-sm mt-6">
          Already have an account?{" "}
          <Link
            className="text-accent-strong font-semibold hover:underline underline-offset-4"
            href="/auth/login"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
