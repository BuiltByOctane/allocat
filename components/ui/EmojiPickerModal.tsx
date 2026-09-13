'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { EmojiStyle, Theme, type EmojiClickData } from 'emoji-picker-react';
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useSheetBackClose } from "@/lib/native/sheetRegistry";

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

interface EmojiPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  /**
   * Portal target. Defaults to document.body. When opened from inside a Vaul
   * drawer, pass the drawer's content node so the picker lands inside Vaul's
   * react-remove-scroll whitelist — otherwise its internal list can't scroll.
   */
  container?: Element | null;
}

export default function EmojiPickerModal({ isOpen, onClose, onSelect, container }: EmojiPickerModalProps) {
  const haptic = useHaptic();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const pickerTheme = resolvedTheme === 'light' ? Theme.LIGHT : Theme.DARK;

  React.useEffect(() => { setMounted(true); }, []);

  // Hardware back closes the picker instead of navigating (it's a custom portal,
  // not a vaul/Radix dialog, so it isn't covered by the Escape path).
  useSheetBackClose(isOpen, onClose);

  if (!isOpen || !mounted) return null;

  const handlePick = (data: EmojiClickData) => {
    haptic.selection();
    onSelect(data.emoji);
    onClose();
  };

  // When the picker is portaled into a vaul Drawer.Content (the `container`
  // prop), `position: fixed` does NOT resolve against the viewport: vaul puts an
  // inline `transform` on that node, which makes it the containing block for
  // every fixed descendant. The picker therefore inherited the drawer's own
  // keyboard displacement and then added `.sheet-3q`'s lift on top of it, which
  // is how it ended up hovering a keyboard's height above the keyboard with its
  // header clipped off the screen.
  //
  // Inside a drawer the right answer is to own no keyboard math at all: the
  // drawer is already sized to the space above the keyboard, so the picker just
  // fills it (`absolute inset-0`). The standalone (body-portal) path keeps the
  // fixed bottom-sheet behaviour, where `.sheet-3q` is resolved against the real
  // viewport and is correct.
  const inDrawer = !!container;

  return createPortal(
    <div
      className={`${
        inDrawer ? 'absolute' : 'fixed'
      } inset-0 z-[100] flex flex-col justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 sm:justify-center sm:items-center`}
      style={{ pointerEvents: 'auto' }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        className={`bg-card w-full max-w-md mx-auto rounded-t-sheet sm:rounded-card p-4 shadow-xl animate-in slide-in-from-bottom flex flex-col border border-border z-[101] sm:h-auto sm:max-h-[80vh] ${
          inDrawer
            ? // Fill the drawer, which is already keyboard-aware.
              'relative min-h-0 flex-1'
            : // Standalone: a real fixed bottom sheet against the viewport.
              'sheet-3q fixed inset-x-0 bottom-0 sm:static'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3 px-2">
          <h2 className="font-display text-foreground font-bold text-[18px] tracking-[-0.02em]">Select Icon</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-2"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex justify-center">
          <EmojiPicker
            onEmojiClick={handlePick}
            emojiStyle={EmojiStyle.NATIVE}
            theme={pickerTheme}
            lazyLoadEmojis
            width="100%"
            height="100%"
            previewConfig={{ showPreview: false }}
            skinTonesDisabled={false}
          />
        </div>
      </div>

      <div className="absolute inset-0" onClick={onClose} />
    </div>,
    container ?? document.body
  );
}
