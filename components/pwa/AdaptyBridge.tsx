"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";
import { activateAdapty, identifyAdapty } from "@/lib/native/adapty";

/**
 * Native-only bridge for Adapty (Google Play Billing). On mount it activates the
 * SDK and binds purchases to the Supabase account (so entitlement maps across
 * devices). No-op on web; inert until the SDK key is configured. The webhook is
 * the authoritative server writer, so nothing is reconciled here. Renders nothing.
 */
export function AdaptyBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      await activateAdapty(user?.id);
      if (cancelled || !user) return;
      await identifyAdapty(user.id);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
