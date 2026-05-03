"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { signup } from "@/lib/actions/auth";
import { useHaptic } from "@/lib/hooks/useHaptic";

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
    <div className="min-h-[100dvh] w-full bg-background text-foreground flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-[480px] mx-auto w-full px-6 py-5 flex items-center gap-3">
          <div className="bg-white rounded-full p-1.5 flex items-center justify-center">
            <Image
              src="/paw-white.png"
              alt="AlloCat"
              width={24}
              height={24}
              className="invert"
              priority
            />
          </div>
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
          Create Account
        </p>
        <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.02em] text-foreground">
          Start tracking
        </h1>
        <p className="text-muted-foreground text-[15px] leading-relaxed mt-3 mb-10">
          Create an account to take control of your finances.
        </p>

        <form action={handleSubmit} className="flex flex-col gap-6">
          {errorMsg && (
            <div className="border border-red-500/30 bg-red-500/5 px-4 py-3 text-red-500 text-sm font-mono tracking-wide">
              {errorMsg}
            </div>
          )}

          <label className="flex flex-col gap-2">
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              Full Name
            </span>
            <input
              name="full_name"
              type="text"
              required
              autoComplete="name"
              className="w-full h-12 bg-card border border-border px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
              placeholder="John Doe"
            />
          </label>

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
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              Password
            </span>
            <div className="flex items-stretch border border-border bg-card focus-within:border-foreground transition-colors">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                autoComplete="new-password"
                className="flex-1 h-12 bg-transparent px-4 text-foreground placeholder:text-muted-foreground focus:outline-none"
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
            <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground mt-1">
              Min 6 characters
            </span>
          </label>

          <button
            type="submit"
            disabled={isPending}
            className="mt-2 w-full h-12 bg-foreground text-background font-mono text-[11px] tracking-[0.18em] uppercase hover:opacity-85 transition-opacity active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? "Creating account…" : "Create Account"}
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
          Already have an account?{" "}
          <Link
            className="text-foreground font-medium underline underline-offset-4 hover:no-underline"
            href="/auth/login"
          >
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
