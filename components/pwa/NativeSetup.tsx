"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SmsReader } from "@/lib/native/SmsReader";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";

const DONE_KEY = "allocat-native-setup-done";

/**
 * First-run native setup (Android only): requests notification + SMS permissions
 * on open, then shows a one-time guide so transaction alerts work even when the
 * app is closed — which requires OEM Autostart + battery-exemption settings that
 * no app can toggle from code.
 */
export function NativeSetup() {
  const [show, setShow] = useState(false);
  const [notif, setNotif] = useState<boolean | null>(null);
  const [sms, setSms] = useState<boolean | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    // Show the disclosure on first run only. We deliberately do NOT request any
    // permission here — the SMS prominent-disclosure policy requires the OS
    // permission prompt to fire only AFTER the user reads this and taps Allow.
    try {
      if (localStorage.getItem(DONE_KEY) !== "1") setShow(true);
    } catch {
      /* ignore */
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background/98 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-5 overflow-y-auto p-6 pt-10">
        <div className="flex items-center gap-2">
          <MaterialSymbol icon="notifications_active" className="text-foreground" />
          <h1 className="text-lg font-bold uppercase tracking-widest">
            Transaction alerts
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          AlloCat reads only your bank/UPI <strong>transaction</strong> SMS to
          auto-track spending. Messages are parsed <strong>on your device</strong>;
          the raw SMS text is never uploaded and never shared with anyone. OTPs and
          personal messages are ignored. For this to work even when the app is
          closed, grant the permissions and enable the two device settings below.
        </p>
        <a
          href="/legal/privacy-policy"
          className="-mt-2 text-xs font-bold uppercase tracking-widest text-muted-foreground underline"
        >
          Read our privacy policy
        </a>

        <Step
          n={1}
          done={notif === true}
          title="Allow notifications"
          desc="So budget and transaction alerts can reach you."
          action="Allow"
          onClick={async () => {
            try {
              const { LocalNotifications } = await import(
                "@capacitor/local-notifications"
              );
              const p = await LocalNotifications.requestPermissions();
              setNotif(p.display === "granted");
              if (p.display !== "granted") await SmsReader.openAppSettings();
            } catch {
              /* ignore */
            }
          }}
        />

        <Step
          n={2}
          done={sms === true}
          title="Allow SMS access"
          desc="Only financial transaction SMS are read — on-device, never sent."
          action="Allow"
          onClick={async () => {
            try {
              const r = await SmsReader.requestPermission();
              setSms(r.granted);
              if (!r.granted) await SmsReader.openAppSettings();
            } catch {
              /* ignore */
            }
          }}
        />

        <Step
          n={3}
          title="Enable Autostart"
          desc="Lets AlloCat catch transactions when the app is closed. This opens your phone Settings — search for “Auto start” (or “Autostart” / “Background”), open it, find AlloCat and turn it ON."
          action="Open settings"
          onClick={() => void SmsReader.openAutostartSettings()}
        />

        <Step
          n={4}
          title="Don't restrict battery"
          desc="Stops the system from killing the SMS listener in the background. This opens Battery optimization — find AlloCat in the list and set it to “Don't optimize” (or “Unrestricted” / “No restrictions”)."
          action="Open settings"
          onClick={() => void SmsReader.openBatterySettings()}
        />

        <div className="mt-auto pt-4">
          <button
            onClick={dismiss}
            className="w-full bg-foreground py-3 text-xs font-bold uppercase tracking-widest text-background"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  desc,
  action,
  onClick,
  done,
}: {
  n: number;
  title: string;
  desc: string;
  action: string;
  onClick: () => void;
  done?: boolean;
}) {
  return (
    <div className="flex gap-3 border border-border p-3">
      <span className="font-mono text-sm font-bold text-muted-foreground">
        {done ? "✓" : n}
      </span>
      <div className="flex-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
        <button
          onClick={onClick}
          disabled={done}
          className="mt-2 border border-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest disabled:opacity-40"
        >
          {done ? "Granted" : action}
        </button>
      </div>
    </div>
  );
}
