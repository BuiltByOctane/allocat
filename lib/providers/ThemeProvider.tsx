"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useEffect, useState, createContext, useContext } from "react";

export type AestheticColor = "zinc" | "slate" | "stone" | "blue" | "emerald" | "rose" | "indigo" | "orange";

export interface CustomTheme {
  primary: AestheticColor;
  card: AestheticColor;
  background: AestheticColor;
}

const defaultTheme: CustomTheme = {
  primary: "zinc",
  card: "zinc",
  background: "zinc",
};

interface CustomThemeContextType {
  customTheme: CustomTheme;
  setThemeElement: (element: keyof CustomTheme, color: AestheticColor) => void;
  resetTheme: () => void;
}

const CustomThemeContext = createContext<CustomThemeContextType | undefined>(undefined);

export function useCustomTheme() {
  const context = useContext(CustomThemeContext);
  if (!context) throw new Error("useCustomTheme must be used within ThemeProvider");
  return context;
}

const colorPalettes = {
  zinc: { light: { bg: "#f5f3ed", card: "#eeece6", primary: "#18181b", border: "rgba(10,10,10,0.1)" }, dark: { bg: "#000000", card: "#18181b", primary: "#fafafa", border: "rgba(255,255,255,0.05)" } },
  slate: { light: { bg: "#f1ede2", card: "#e8e3d5", primary: "#0f172a", border: "rgba(10,10,10,0.1)" }, dark: { bg: "#020617", card: "#0f172a", primary: "#f8fafc", border: "rgba(255,255,255,0.05)" } },
  stone: { light: { bg: "#f5f0e3", card: "#ede6d4", primary: "#1c1917", border: "rgba(28,25,23,0.1)" }, dark: { bg: "#0c0a09", card: "#1c1917", primary: "#fafaf9", border: "rgba(255,255,255,0.05)" } },
  blue: { light: { bg: "#eff6ff", card: "#ffffff", primary: "#2563eb", border: "rgba(37,99,235,0.1)" }, dark: { bg: "#020817", card: "#0f172a", primary: "#3b82f6", border: "rgba(59,130,246,0.1)" } },
  emerald: { light: { bg: "#ecfdf5", card: "#ffffff", primary: "#10b981", border: "rgba(16,185,129,0.1)" }, dark: { bg: "#022c22", card: "#064e3b", primary: "#34d399", border: "rgba(52,211,153,0.1)" } },
  rose: { light: { bg: "#fff1f2", card: "#ffffff", primary: "#e11d48", border: "rgba(225,29,72,0.1)" }, dark: { bg: "#4c0519", card: "#881337", primary: "#fb7185", border: "rgba(251,113,133,0.1)" } },
  indigo: { light: { bg: "#eef2ff", card: "#ffffff", primary: "#4f46e5", border: "rgba(79,70,229,0.1)" }, dark: { bg: "#1e1b4b", card: "#312e81", primary: "#818cf8", border: "rgba(129,140,248,0.1)" } },
  orange: { light: { bg: "#fff7ed", card: "#ffffff", primary: "#ea580c", border: "rgba(234,88,12,0.1)" }, dark: { bg: "#431407", card: "#7c2d12", primary: "#fdba74", border: "rgba(253,186,116,0.1)" } },
};

function ThemeInjector({ customTheme }: { customTheme: CustomTheme }) {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const isDark = resolvedTheme === "dark";
    const mode = isDark ? "dark" : "light";
    const root = document.documentElement;

    root.style.setProperty("--background", colorPalettes[customTheme.background][mode].bg);
    root.style.setProperty("--color-background", colorPalettes[customTheme.background][mode].bg);
    
    root.style.setProperty("--card", colorPalettes[customTheme.card][mode].card);
    root.style.setProperty("--color-card", colorPalettes[customTheme.card][mode].card);
    
    root.style.setProperty("--border", colorPalettes[customTheme.card][mode].border);
    root.style.setProperty("--color-border", colorPalettes[customTheme.card][mode].border);

    root.style.setProperty("--primary", colorPalettes[customTheme.primary][mode].primary);
    root.style.setProperty("--color-primary", colorPalettes[customTheme.primary][mode].primary);

  }, [customTheme, resolvedTheme]);

  return null;
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const [{ mounted, customTheme }, setState] = useState({
    mounted: false,
    customTheme: defaultTheme
  });

  useEffect(() => {
    const saved = localStorage.getItem("custom-theme");
    let theme = defaultTheme;
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        theme = { ...defaultTheme, ...parsed };
      } catch {}
    }
    
    // Use requestAnimationFrame to defer the state update until after the initial paint
    // This avoids the "synchronous setState in effect" warning while ensuring 
    // we still mount as soon as possible.
    requestAnimationFrame(() => {
      setState({ mounted: true, customTheme: theme });
    });
  }, []);

  const setThemeElement = (element: keyof CustomTheme, color: AestheticColor) => {
    setState((prev) => {
      const updatedTheme = { ...prev.customTheme, [element]: color };
      localStorage.setItem("custom-theme", JSON.stringify(updatedTheme));
      return { ...prev, customTheme: updatedTheme };
    });
  };

  const resetTheme = () => {
    setState((prev) => ({ ...prev, customTheme: defaultTheme }));
    localStorage.removeItem("custom-theme");
  };

  return (
    <NextThemesProvider {...props}>
      <CustomThemeContext.Provider value={{ customTheme, setThemeElement, resetTheme }}>
        {mounted && <ThemeInjector customTheme={customTheme} />}
        {children}
      </CustomThemeContext.Provider>
    </NextThemesProvider>
  );
}
