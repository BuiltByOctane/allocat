"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Card } from "@/components/ui/Card";

export default function ThemeSelector() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const activeTheme = theme === "system" ? resolvedTheme : theme;
  const isDark = activeTheme === "dark";

  return (
    <Card className="flex items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tile text-muted-foreground">
        {isDark ? <Moon size={18} strokeWidth={1.7} /> : <Sun size={18} strokeWidth={1.7} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-bold text-foreground leading-none">Appearance</p>
        <p className="text-[10.5px] font-medium text-muted-foreground mt-1" suppressHydrationWarning>
          {isDark ? "Dark" : "Light"} mode
        </p>
      </div>
      <button
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className="relative w-12 h-7 rounded-full bg-foreground flex items-center px-1 transition-colors shrink-0 focus:outline-none"
        aria-label="Toggle light and dark mode"
        suppressHydrationWarning
      >
        <span
          className={`size-5 bg-card rounded-full transition-transform duration-300 ${
            isDark ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </Card>
  );
}
