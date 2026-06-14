"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";
import {
  activateAdapty,
  identifyAdapty,
  syncEntitlementToServer,
} from "@/lib/native/adapty";

/**
 * Native-only bridge for Adapty (Google Play Billing). On mount it activates the
 * SDK, binds purchases to the Supabase account (so entitlement maps across
 * devices), and reconciles entitlement to the server on open. No-op on web and
 * inert until the SDK is installed (see lib/native/adapty.ts). Renders nothing.
 */
export function AdaptyBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    (async () => {
      await activateAdapty();
      if (cancelled) return;

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      await identifyAdapty(user.id);
      await syncEntitlementToServer();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
