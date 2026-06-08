"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { hasNumericText } from "@/lib/number-format";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Optional sub-label shown below the label */
  description?: string;
  /** Optional emoji/icon prefix */
  icon?: string | null;
}

interface BottomSheetSelectProps<T extends string = string> {
  /** Optional id for the trigger button */
  id?: string;
  /** Displayed on the trigger button when nothing is selected */
  placeholder?: string;
  /** Label shown at the top of the sheet */
  title: string;
  options: SelectOption<T>[];
  value: T | "";
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Optional className override for the trigger button */
  className?: string;
}

export function BottomSheetSelect<T extends string = string>({
  id,
  placeholder = "Select…",
  title,
  options,
  value,
  onChange,
  disabled = false,
  className,
}: BottomSheetSelectProps<T>) {
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.value === value);
  const selectedHasNumericText = selected ? hasNumericText(selected.label) : false;

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      {/* Trigger */}
      <Drawer.Trigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={
            className ??
            "w-full flex items-center justify-between bg-card border border-border rounded-[13px] px-3.5 py-3 text-sm font-medium text-foreground focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          }
        >
          <span
            className={[
              selected ? "text-foreground" : "text-muted-foreground",
              selectedHasNumericText ? "font-mono tabular-nums" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {selected
              ? `${selected.icon ? selected.icon + " " : ""}${selected.label}`
              : placeholder}
          </span>
          <span className="material-symbols-outlined text-muted-foreground text-[18px] shrink-0 ml-2">
            expand_more
          </span>
        </button>
      </Drawer.Trigger>

      {/* Overlay */}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />

        <Drawer.Content
          aria-describedby={undefined}
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-sheet bg-card max-h-[80vh] focus:outline-none"
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-9 h-1 bg-border rounded-full" />
          </div>

          {/* Title */}
          <div className="px-5 py-3 shrink-0">
            <Drawer.Title className="font-display text-[18px] font-bold tracking-[-0.02em] text-foreground m-0">
              {title}
            </Drawer.Title>
          </div>

          {/* Options list */}
          <div className="overflow-y-auto overscroll-contain flex-1 pb-safe">
            <ul className="px-2 py-2 space-y-0.5">
              {options.map((opt) => {
                const isSelected = opt.value === value;
                const labelHasNumericText = hasNumericText(opt.label);
                const descriptionHasNumericText = opt.description
                  ? hasNumericText(opt.description)
                  : false;
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(opt.value as T);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left transition-colors ${
                        isSelected
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 active:bg-muted"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {opt.icon && (
                          <span className="text-lg leading-none shrink-0">
                            {opt.icon}
                          </span>
                        )}
                        <div>
                          <span
                            className={[
                              "text-sm font-medium block",
                              labelHasNumericText ? "font-mono tabular-nums" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {opt.label}
                          </span>
                          {opt.description && (
                            <span
                              className={[
                                "text-[11px] text-muted-foreground block mt-0.5",
                                descriptionHasNumericText
                                  ? "font-mono tabular-nums"
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              {opt.description}
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <span className="material-symbols-outlined text-foreground text-[18px] shrink-0">
                          check
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {/* Extra padding so last item clears home indicator on iOS */}
            <div className="h-6" />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
