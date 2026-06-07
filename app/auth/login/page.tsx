"use client";

import Link from "next/link";
import Image from "next/image";
import { login } from "@/lib/actions/auth";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useState } from "react";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const haptic = useHaptic();

  async function handleSubmit(formData: FormData) {
    haptic.light();
    setIsPending(true);
    setErrorMsg(null);
    const res = await login(formData);
    if (res?.error) {
      haptic.error();
      setErrorMsg(res.error);
      setIsPending(false);
    } else {
      haptic.success();
    }
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-[480px] mx-auto w-full px-6 py-5 flex items-center gap-3">
            <Image
              src="/paw.png"
              alt="AlloCat"
              width={24}
              height={24}
              className="invert"
              priority
            />
          <div className="flex flex-col leading-none">
            <span className="font-display text-[20px] tracking-[-0.02em] text-foreground">
              AlloCat
            </span>
            <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground mt-1">
              Financial Overview
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[480px] mx-auto px-6 py-12">
        <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Sign In
        </p>
        <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.02em] text-foreground">
          Welcome back
        </h1>
        <p className="text-muted-foreground text-[15px] leading-relaxed mt-3 mb-10">
          Enter your details to access your account.
        </p>

        <form action={handleSubmit} className="flex flex-col gap-6">
          {errorMsg && (
            <div className="border border-neg/30 bg-neg/5 px-4 py-3 text-neg text-sm font-mono tracking-wide">
              {errorMsg}
            </div>
          )}

          <label className="flex flex-col gap-2">
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              Email Address
            </span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full h-12 bg-card border border-border px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
              placeholder="name@example.com"
            />
          </label>

          <label className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                Password
              </span>
              <Link
                href="#"
                className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground hover:text-foreground transition-colors"
              >
                Forgot?
              </Link>
            </div>
            <div className="flex items-stretch border border-border bg-card focus-within:border-foreground transition-colors">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="flex-1 h-12 bg-transparent px-4 text-foreground placeholder:text-muted-foreground focus:outline-none"
                placeholder="Enter your password"
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
          </label>

          <button
            type="submit"
            disabled={isPending}
            className="mt-2 w-full h-12 bg-foreground text-background font-mono text-[11px] tracking-[0.18em] uppercase hover:opacity-85 transition-opacity active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div className="flex items-center gap-4 my-8">
          <div className="flex-1 h-px bg-border" />
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
            or continue with
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <OAuthButtons />

        <p className="text-center text-muted-foreground text-sm mt-10">
          Don&apos;t have an account?{" "}
          <Link
            className="text-foreground font-medium underline underline-offset-4 hover:no-underline"
            href="/auth/signup"
          >
            Create account
          </Link>
        </p>
      </main>
    </div>
  );
}
