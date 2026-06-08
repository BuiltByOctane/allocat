"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useCustomTheme, AestheticColor, CustomTheme } from "@/lib/providers/ThemeProvider";
import { Card } from "@/components/ui/Card";

export default function ThemeSelector() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { customTheme, setThemeElement, resetTheme } = useCustomTheme();
  const activeTheme = theme === "system" ? resolvedTheme : theme;

  const curatedColors: { name: AestheticColor; class: string }[] = [
    { name: "zinc", class: "bg-zinc-500" },
    { name: "slate", class: "bg-slate-500" },
    { name: "stone", class: "bg-stone-500" },
    { name: "blue", class: "bg-blue-500" },
    { name: "emerald", class: "bg-emerald-500" },
    { name: "rose", class: "bg-rose-500" },
    { name: "indigo", class: "bg-indigo-500" },
    { name: "orange", class: "bg-orange-500" },
  ];

  const renderColorRow = (label: string, elementKey: keyof CustomTheme) => (
    <div className="flex flex-col gap-2">
      <p className="t-label text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-2.5">
        {curatedColors.map((c) => (
          <button
            key={c.name}
            onClick={() => setThemeElement(elementKey, c.name)}
            className={`size-[26px] rounded-full ${c.class} transition-all ${
              customTheme[elementKey] === c.name ? "" : "opacity-60 hover:opacity-100"
            }`}
            style={
              customTheme[elementKey] === c.name
                ? { boxShadow: "0 0 0 2px var(--card), 0 0 0 4px var(--foreground)" }
                : undefined
            }
            aria-label={`Select ${c.name} for ${label}`}
          />
        ))}
      </div>
    </div>
  );

  return (
    <Card className="flex flex-col gap-5">
      {/* Header & Mode Toggle */}
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tile text-muted-foreground">
          {activeTheme === "light" ? <Sun size={18} strokeWidth={1.7} /> : <Moon size={18} strokeWidth={1.7} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-bold text-foreground leading-none">Aesthetic Canvas</p>
          <p className="text-[10.5px] font-medium text-muted-foreground mt-1">Customize UI elements</p>
        </div>
        {/* Toggle Light/Dark */}
        <button
          onClick={() => setTheme(activeTheme === "dark" ? "light" : "dark")}
          className="relative w-11 h-6 rounded-full bg-foreground flex items-center px-1 transition-colors shrink-0 focus:outline-none"
          aria-label="Toggle structural mode"
          suppressHydrationWarning
        >
          <div
            className={`w-4 h-4 bg-card rounded-full transition-transform duration-300 ${
              activeTheme === "dark" ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Customizer Tiers */}
      <div className="flex flex-col gap-4 pt-4 border-t border-border">
        {renderColorRow("Canvas Base", "background")}
        {renderColorRow("Modules & Cards", "card")}
        {renderColorRow("Primary Actions", "primary")}
      </div>

      <div className="flex justify-end">
        <button
          onClick={resetTheme}
          className="t-label text-muted-foreground hover:text-foreground transition-colors"
        >
          Reset to default
        </button>
      </div>
    </Card>
  );
}
