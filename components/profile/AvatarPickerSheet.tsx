"use client";

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { AVATARS, DEFAULT_AVATAR } from "@/lib/profile/avatars";
import { useUpdateAvatar } from "@/lib/hooks/useUpdateAvatar";
import UserAvatar from "./UserAvatar";

interface AvatarPickerSheetProps {
  open: boolean;
  onClose: () => void;
  current: string | null | undefined;
}

export default function AvatarPickerSheet({ open, onClose, current }: AvatarPickerSheetProps) {
  const updateAvatar = useUpdateAvatar();
  const selected = current ?? DEFAULT_AVATAR;

  function pick(id: string) {
    if (id !== selected) updateAvatar.mutate(id);
    onClose();
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>Choose your avatar</DrawerTitle>
          <DrawerDescription>Pick the cat that&apos;s most you.</DrawerDescription>
        </DrawerHeader>

        <div className="grid grid-cols-3 gap-3 overflow-y-auto px-4 pb-8">
          {AVATARS.map((a) => {
            const active = a.id === selected;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => pick(a.id)}
                disabled={updateAvatar.isPending}
                aria-label={a.label}
                aria-pressed={active}
                className={`relative flex aspect-square items-center justify-center rounded-full bg-secondary transition disabled:opacity-60 ${
                  active ? "ring-2 ring-accent ring-offset-2 ring-offset-card" : "hover:opacity-90"
                }`}
              >
                <UserAvatar id={a.id} size={96} className="size-full" />
                {active && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-6 items-center justify-center rounded-full bg-accent text-[var(--accent-ink)] shadow">
                    <span className="material-symbols-outlined text-[16px] leading-none">check</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
