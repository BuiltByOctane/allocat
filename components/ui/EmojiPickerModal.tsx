'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { EmojiStyle, Theme, type EmojiClickData } from 'emoji-picker-react';
import { useHaptic } from "@/lib/hooks/useHaptic";

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

interface EmojiPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}

export default function EmojiPickerModal({ isOpen, onClose, onSelect }: EmojiPickerModalProps) {
  const haptic = useHaptic();
  const { resolvedTheme } = useTheme();
  const pickerTheme = resolvedTheme === 'light' ? Theme.LIGHT : Theme.DARK;

  if (!isOpen) return null;

  const handlePick = (data: EmojiClickData) => {
    haptic.selection();
    onSelect(data.emoji);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4 pb-20 animate-in fade-in duration-200">
      <div
        className="bg-card w-full max-w-md rounded-t-2xl sm:rounded-2xl p-4 shadow-xl animate-in slide-in-from-bottom flex flex-col max-h-[80vh] border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3 px-2">
          <h2 className="text-foreground font-semibold text-lg">Select Icon</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-2"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex justify-center">
          <EmojiPicker
            onEmojiClick={handlePick}
            emojiStyle={EmojiStyle.NATIVE}
            theme={pickerTheme}
            lazyLoadEmojis
            width="100%"
            height={420}
            previewConfig={{ showPreview: false }}
            skinTonesDisabled={false}
          />
        </div>
      </div>

      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
