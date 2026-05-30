"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Pencil } from "lucide-react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { CurrencyText } from "@/components/ui/CurrencyText";
import { useCurrency } from "@/lib/providers/CurrencyProvider";

interface InlineEditableNumberProps {
  value: number;
  onSave: (val: number) => void;
  className?: string;
  formatAsCurrency?: boolean;
}

export function InlineEditableNumber({ value, onSave, className = "", formatAsCurrency = true }: InlineEditableNumberProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentVal, setCurrentVal] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);
  const haptic = useHaptic();
  const { def } = useCurrency();

  useEffect(() => {
    setCurrentVal(value.toString());
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // Select all text when focusing
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    setIsEditing(false);
    const num = parseFloat(currentVal);
    if (!isNaN(num) && num >= 0 && num !== value) {
      haptic.success();
      setCurrentVal(value.toString());
      onSave(num);
    } else {
      setCurrentVal(value.toString());
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setCurrentVal(value.toString());
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min="0"
        step="1"
        value={currentVal}
        onChange={(e) => setCurrentVal(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        style={{ fontSize: "inherit", lineHeight: "inherit", letterSpacing: "inherit", fontFamily: "inherit" }}
        className={`bg-background text-foreground rounded outline-none border border-border focus:border-primary px-1 w-full tabular-nums ${className}`}
      />
    );
  }

  const displayVal = value.toLocaleString(def.locale);

  return (
    <span
      onClick={() => {
        haptic.light();
        setIsEditing(true);
      }}
      className={`relative inline-flex cursor-pointer hover:bg-muted transition-colors rounded px-1 -mx-1 font-mono ${className}`}
    >
      <Pencil className="absolute -top-1 -right-2 w-2.5 h-2.5 text-muted-foreground shrink-0" />
      {formatAsCurrency ? <CurrencyText value={value} /> : displayVal}
    </span>
  );
}
