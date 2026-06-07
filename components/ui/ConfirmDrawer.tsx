"use client";

import { Drawer } from "vaul";
import { useHaptic } from "@/lib/hooks/useHaptic";

interface ConfirmDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
}

export function ConfirmDrawer({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
}: ConfirmDrawerProps) {
  const haptic = useHaptic();

  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content 
          aria-describedby={description ? "confirm-description" : undefined}
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-card border-t border-border px-5 pt-3 pb-safe focus:outline-none"
        >
          {/* Drag handle */}
          <div className="flex justify-center pb-4 shrink-0">
            <div className="w-10 h-1 bg-muted rounded-full" />
          </div>

          {/* Title and Description */}
          <div className="text-center mb-6">
            <Drawer.Title className="text-lg font-bold text-foreground mb-2">
              {title}
            </Drawer.Title>
            {description && (
              <p id="confirm-description" className="text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 pb-6">
            <button
              onClick={() => {
                haptic.heavy();
                onConfirm();
              }}
              className="w-full py-3.5 bg-destructive/10 text-destructive font-bold rounded-xl active:scale-[0.98] transition-all hover:bg-destructive/20"
            >
              {confirmText}
            </button>
            <button
              onClick={() => {
                haptic.light();
                onClose();
              }}
              className="w-full py-3.5 bg-muted text-foreground font-medium rounded-xl active:scale-[0.98] transition-all"
            >
              {cancelText}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
