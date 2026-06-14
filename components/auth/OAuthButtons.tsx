"use client";

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";
import { useHaptic } from "@/lib/hooks/useHaptic";

// Custom-scheme deep link the native shell intercepts (see NativeShell + AndroidManifest).
const NATIVE_OAUTH_REDIRECT = "com.octane.allocat://auth/callback";

export function OAuthButtons() {
  const [isPending, setIsPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const haptic = useHaptic();

  const handleGoogleLogin = async () => {
    haptic.light();
    setIsPending(true);
    setErrorMsg(null);
    const supabase = createClient();
    const isNative = Capacitor.isNativePlatform();

    // Native: Google blocks OAuth inside Android WebViews, so we open the
    // provider URL in a Custom Tab and bounce back via a custom-scheme deep
    // link. signInWithOAuth still sets the PKCE code_verifier cookie in the
    // WebView, so the /auth/callback route can exchange the code on return.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: isNative
          ? NATIVE_OAUTH_REDIRECT
          : `${window.location.origin}/auth/callback`,
        skipBrowserRedirect: isNative,
      },
    });

    if (error) {
      haptic.error();
      setErrorMsg(error.message);
      setIsPending(false);
      return;
    }

    if (isNative && data?.url) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: data.url });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {errorMsg && (
        <div className="rounded-[13px] border border-neg/30 bg-neg/5 px-4 py-3 text-neg text-sm font-medium">
          {errorMsg}
        </div>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={handleGoogleLogin}
        className="flex items-center justify-center gap-3 h-[48px] rounded-pill bg-card border border-border font-bold text-sm text-foreground hover:border-foreground/40 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
          />
        </svg>
        <span>
          {isPending ? "Connecting…" : "Continue with Google"}
        </span>
      </button>
    </div>
  );
}
