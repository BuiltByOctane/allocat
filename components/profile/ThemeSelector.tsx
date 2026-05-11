"use client";

import { useTheme } from "next-themes";
import { useCustomTheme, AestheticColor, CustomTheme } from "@/lib/providers/ThemeProvider";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";

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
      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        {curatedColors.map((c) => (
          <button
            key={c.name}
            onClick={() => setThemeElement(elementKey, c.name)}
            className={`w-6 h-6 rounded-full ${c.class} ${
              customTheme[elementKey] === c.name
                ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                : "opacity-60 hover:opacity-100"
            } transition-all`}
            aria-label={`Select ${c.name} for ${label}`}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="bg-card p-6 flex flex-col gap-8 col-span-1 md:col-span-2 border-b md:border-b-0 border-border">
      
      {/* Header & Mode Toggle */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <MaterialSymbol icon={activeTheme === "light" ? "light_mode" : "dark_mode"} className="text-foreground" />
          <div>
            <p className="font-bold text-foreground leading-none">Aesthetic Canvas</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
              Customize UI Elements
            </p>
          </div>
        </div>
        
        {/* Toggle Light/Dark */}
        <button
          onClick={() => setTheme(activeTheme === "dark" ? "light" : "dark")}
          className="w-12 h-6 bg-primary relative rounded-full flex items-center px-1 transition-colors group focus:outline-none"
          aria-label="Toggle structural mode"
          suppressHydrationWarning
        >
          <div className={`w-4 h-4 bg-primary-foreground rounded-full transition-transform duration-300 ${activeTheme === "dark" ? "translate-x-6" : "translate-x-0"}`}></div>
        </button>
      </div>
      
      {/* Customizer Tiers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2 border-t border-border">
        {renderColorRow("Canvas Base", "background")}
        {renderColorRow("Modules & Cards", "card")}
        {renderColorRow("Primary Actions", "primary")}
      </div>

      <div className="flex justify-end pt-2">
        <button 
          onClick={resetTheme}
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}
