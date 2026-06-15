'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { EmojiStyle, Theme, type EmojiClickData } from 'emoji-picker-react';
import { useHaptic } from "@/lib/hooks/useHaptic";

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

  if (!isOpen || !mounted) return null;

  const handlePick = (data: EmojiClickData) => {
    haptic.selection();
    onSelect(data.emoji);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4 pb-20 animate-in fade-in duration-200"
      style={{ pointerEvents: 'auto' }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        className="bg-card w-full max-w-md rounded-t-sheet sm:rounded-card p-4 shadow-xl animate-in slide-in-from-bottom flex flex-col sheet-3q border border-border relative z-[101]"
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
