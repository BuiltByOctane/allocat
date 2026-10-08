"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useAppFlags } from "@/lib/hooks/useAppFlags";
import { IOS_SHORTCUT_URL, isIosDevice } from "@/lib/shortcut/config";
import { IOS_SHORTCUT_LS_KEY } from "@/components/pwa/ShortcutReconciler";

/** Deep link that opens the setup card expanded on /sms. */
export const IOS_SETUP_HREF = "/sms?setup=ios";

export interface IosShortcutState {
  /** iPhone web/PWA, SMS on, and the shared shortcut is published. */
  eligible: boolean;
  /** This device has created a key (set by the setup card). */
  setUp: boolean;
}

/**
 * Whether to offer iPhone auto-capture on this device. Platform detection is
 * client-only, so both values start false and resolve after mount.
 */
export function useIosShortcut(): IosShortcutState {
  const { sms_enabled } = useAppFlags();
  const [state, setState] = useState<IosShortcutState>({ eligible: false, setUp: false });

  useEffect(() => {
    if (!IOS_SHORTCUT_URL || Capacitor.isNativePlatform() || !isIosDevice()) return;
    let setUp = false;
    try {
      setUp = window.localStorage.getItem(IOS_SHORTCUT_LS_KEY) === "1";
    } catch {
      /* storage unavailable — treat as not set up */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ eligible: true, setUp });
  }, []);

  return { eligible: state.eligible && sms_enabled, setUp: state.setUp };
}
