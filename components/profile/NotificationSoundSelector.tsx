"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Card } from "@/components/ui/Card";
import { useHaptic } from "@/lib/hooks/useHaptic";
import {
  NOTIF_SOUNDS,
  DEFAULT_NOTIF_SOUND,
  notifSoundLabel,
  nativeSoundKey,
  type NotifSoundId,
} from "@/lib/native/notifSounds";
import {
  notifSound,
  setNotifSound,
  confirmAutoAllocate,
} from "@/lib/sms/notifPrefs";
import { SmsReader } from "@/lib/native/SmsReader";

export default function NotificationSoundSelector() {
  const haptic = useHaptic();
  const [sound, setSound] = useState<NotifSoundId>(DEFAULT_NOTIF_SOUND);
  const [hydrated, setHydrated] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setSound(notifSound());
    setHydrated(true);
  }, []);

  function select(id: NotifSoundId) {
    haptic.selection();
    setSound(id);
    setNotifSound(id);

    // Preview on tap (no preview asset for the system default).
    const preview = NOTIF_SOUNDS.find((s) => s.id === id)?.preview;
    if (preview) {
      try {
        audioRef.current?.pause();
        const a = new Audio(preview);
        audioRef.current = a;
        void a.play().catch(() => {});
      } catch {
        /* ignore */
      }
    }

    // Push to the native layer so the closed-app notification uses it.
    if (Capacitor.isNativePlatform()) {
      void SmsReader.setConfig({
        confirmAutoAllocate: confirmAutoAllocate(),
        sound: nativeSoundKey(id),
      });
    }
  }

  return (
    <Card className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tile text-muted-foreground">
          <Bell size={18} strokeWidth={1.7} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-bold text-foreground leading-none">
            Notification sound
          </p>
          <p
            className="text-[10.5px] font-medium text-muted-foreground mt-1"
            suppressHydrationWarning
          >
            {hydrated ? notifSoundLabel(sound) : "Alert tone"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-12">
        {NOTIF_SOUNDS.map((s) => {
          const active = hydrated && sound === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => select(s.id)}
              aria-pressed={active}
              className={`px-3 h-8 rounded-pill text-[11.5px] font-bold transition-transform active:scale-95 ${
                active
                  ? "bg-foreground text-card"
                  : "bg-tile text-muted-foreground"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
