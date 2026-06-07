"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useHaptic } from "@/lib/hooks/useHaptic";

interface InlineEditableTextProps {
  value: string;
  onSave: (val: string) => void;
  className?: string;
  placeholder?: string;
}

export function InlineEditableText({ value, onSave, className = "", placeholder }: InlineEditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentVal, setCurrentVal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const haptic = useHaptic();

  useEffect(() => {
    setCurrentVal(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    setIsEditing(false);
    if (currentVal.trim() !== value && currentVal.trim() !== "") {
      haptic.success();
      onSave(currentVal.trim());
    } else {
      setCurrentVal(value);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setCurrentVal(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={currentVal}
        placeholder={placeholder}
        onChange={(e) => setCurrentVal(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`bg-background text-foreground rounded outline-none border border-border focus:border-primary px-1 w-full max-w-[200px] ${className}`}
      />
    );
  }

  const enterEdit = () => {
    haptic.light();
    setIsEditing(true);
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Edit text"
      onClick={enterEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          enterEdit();
        }
      }}
      className={`cursor-pointer border-b border-dotted border-muted-foreground/50 hover:border-foreground transition-colors ${className}`}
    >
      {value || (placeholder && <span className="opacity-50">{placeholder}</span>)}
    </span>
  );
}
