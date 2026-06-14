"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useRegisterQuickAction } from "@/lib/providers/QuickActionProvider";
import { useEntitlement } from "@/lib/providers/EntitlementProvider";
import { usePaywall } from "@/lib/providers/PaywallProvider";

// Lazy-load the heavy drawer so it doesn't block initial page render
const ChatDrawer = dynamic(() => import("@/components/ai/ChatDrawer"), {
  ssr: false,
});

export default function AIOverlay() {
  const [open, setOpen] = useState(false);
  const { tier } = useEntitlement();
  const { open: openPaywall } = usePaywall();

  // AI chat is Premium-only. Free tier sees the paywall instead of the chat.
  const openChat = useCallback(() => {
    if (tier !== "premium") {
      openPaywall("ai");
      return;
    }
    setOpen(true);
  }, [tier, openPaywall]);

  // Dashboard's quick-action dock button opens AlloCat AI chat.
  useRegisterQuickAction({
    id: "dashboard",
    label: "Open AlloCat AI",
    icon: "paw",
    onTrigger: openChat,
  });

  return <ChatDrawer open={open} onClose={() => setOpen(false)} />;
}
