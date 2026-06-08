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
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card px-5 pt-3 pb-safe focus:outline-none"
        >
          {/* Drag handle */}
          <div className="flex justify-center pb-4 shrink-0">
            <div className="w-9 h-1 bg-border rounded-full" />
          </div>

          {/* Title and Description */}
          <div className="text-center mb-6">
            <Drawer.Title className="font-display text-[20px] font-bold tracking-[-0.02em] text-foreground mb-2">
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
              className="w-full py-3.5 bg-[var(--neg-dim)] text-neg font-bold rounded-pill active:scale-[0.98] transition-all hover:brightness-95"
            >
              {confirmText}
            </button>
            <button
              onClick={() => {
                haptic.light();
                onClose();
              }}
              className="w-full py-3.5 bg-muted text-foreground font-semibold rounded-pill active:scale-[0.98] transition-all"
            >
              {cancelText}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
