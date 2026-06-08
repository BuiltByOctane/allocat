"use client";

import { useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export default function ChatInput({ value, onChange, onSend, disabled }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  };

  return (
    <div
      className="flex items-end gap-2 border-t border-border bg-background px-4 pt-3"
      style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
    >
      <textarea
        ref={textareaRef}
        id="ai-chat-input"
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask AlloCat anything…"
        disabled={disabled}
        className="flex-1 resize-none rounded-[20px] border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-accent disabled:opacity-50"
        style={{ minHeight: "46px", maxHeight: "120px" }}
      />
      <button
        id="ai-chat-send"
        onClick={onSend}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-[var(--accent-ink)] transition-all disabled:opacity-30 active:scale-95"
      >
        <ArrowUp size={20} strokeWidth={2.4} />
      </button>
    </div>
  );
}
