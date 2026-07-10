"use client";

import { useState } from "react";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { AuthShell, AuthField, authInputClass } from "@/components/auth/AuthShell";
import { signup } from "@/lib/actions/auth";
import { useHaptic } from "@/lib/hooks/useHaptic";
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
    <AuthShell
      eyebrow="Create account"
      title="Start tracking"
      subtitle="Take control of your finances in minutes - no spreadsheets required."
      switchPrompt="Already have an account?"
      switchHref="/auth/login"
      switchCta="Sign in"
      footer={
        <form id="signup-form" action={handleSubmit} className="flex flex-col gap-3">
          <Button
            type="submit"
            variant="lime"
            block
            loading={isPending}
            className="h-[52px] text-[15px]"
          >
            {isPending ? "Creating account…" : "Create account"}
          </Button>

          <div className="my-1 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="t-label text-muted-foreground">or continue with</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <OAuthButtons />
        </form>
      }
    >
      <div className="flex flex-col gap-5">
        {errorMsg && (
          <div className="rounded-2xl border border-neg/30 bg-neg/5 px-4 py-3 text-sm font-medium text-neg">
            {errorMsg}
          </div>
        )}

        <AuthField label="Full name">
          <input
            form="signup-form"
            name="full_name"
            type="text"
            required
            autoComplete="name"
            className={authInputClass}
            placeholder="John Doe"
          />
        </AuthField>

        <AuthField label="Email address">
          <input
            form="signup-form"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            className={authInputClass}
            placeholder="name@example.com"
          />
        </AuthField>

        <div className="flex flex-col gap-2">
          <span className="t-label text-muted-foreground">Password</span>
          <div className="flex items-stretch rounded-2xl border border-border bg-card transition-colors focus-within:border-[var(--accent-strong)] focus-within:ring-2 focus-within:ring-[var(--accent)]/40">
            <input
              form="signup-form"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              autoComplete="new-password"
              className="flex-1 rounded-2xl bg-transparent px-4 py-3.5 text-[15px] font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground focus:outline-none"
              placeholder="Create a secure password"
            />
            <button
              type="button"
              onClick={() => {
                haptic.light();
                setShowPassword(!showPassword);
              }}
              className="px-4 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <span className="material-symbols-outlined text-[22px]">
                {showPassword ? "visibility_off" : "visibility"}
              </span>
            </button>
          </div>
          <span className="t-label text-muted-foreground">Min 6 characters</span>
        </div>
      </div>
    </AuthShell>
  );
}
