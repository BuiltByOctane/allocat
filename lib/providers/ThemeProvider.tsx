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

/* Neo · Lime "Canvas base" tints. Lime stays the fixed accent and the primary
   (ink) pill is constant across all hues — the canvas only re-tints the
   background/card surfaces, matching the redesign's "Canvas base" swatches. */
const NEO_INK_LIGHT = "#111113";
const NEO_INK_DARK = "#0a0a0c";
const NEO_BORDER_LIGHT = "#ececec";
const NEO_BORDER_DARK = "rgba(255,255,255,0.10)";

const colorPalettes = {
  zinc:    { light: { bg: "#efeff0", card: "#ffffff", primary: NEO_INK_LIGHT, border: NEO_BORDER_LIGHT }, dark: { bg: "#0f0f12", card: "#1a1a1f", primary: NEO_INK_DARK, border: NEO_BORDER_DARK } },
  slate:   { light: { bg: "#eef0f2", card: "#ffffff", primary: NEO_INK_LIGHT, border: NEO_BORDER_LIGHT }, dark: { bg: "#0e0f12", card: "#181a1f", primary: NEO_INK_DARK, border: NEO_BORDER_DARK } },
  stone:   { light: { bg: "#f1efeb", card: "#ffffff", primary: NEO_INK_LIGHT, border: NEO_BORDER_LIGHT }, dark: { bg: "#100f0e", card: "#1b1a18", primary: NEO_INK_DARK, border: NEO_BORDER_DARK } },
  blue:    { light: { bg: "#eef2f8", card: "#ffffff", primary: NEO_INK_LIGHT, border: NEO_BORDER_LIGHT }, dark: { bg: "#0d0f14", card: "#171a21", primary: NEO_INK_DARK, border: NEO_BORDER_DARK } },
  emerald: { light: { bg: "#edf3ef", card: "#ffffff", primary: NEO_INK_LIGHT, border: NEO_BORDER_LIGHT }, dark: { bg: "#0d110f", card: "#171c19", primary: NEO_INK_DARK, border: NEO_BORDER_DARK } },
  rose:    { light: { bg: "#f6eef0", card: "#ffffff", primary: NEO_INK_LIGHT, border: NEO_BORDER_LIGHT }, dark: { bg: "#120e10", card: "#1d181a", primary: NEO_INK_DARK, border: NEO_BORDER_DARK } },
  indigo:  { light: { bg: "#eeeef7", card: "#ffffff", primary: NEO_INK_LIGHT, border: NEO_BORDER_LIGHT }, dark: { bg: "#0e0e14", card: "#181821", primary: NEO_INK_DARK, border: NEO_BORDER_DARK } },
  orange:  { light: { bg: "#f5efe8", card: "#ffffff", primary: NEO_INK_LIGHT, border: NEO_BORDER_LIGHT }, dark: { bg: "#120f0c", card: "#1c1815", primary: NEO_INK_DARK, border: NEO_BORDER_DARK } },
};

/**
 * Override boundary: this injector mutates ONLY the four structural vars
 * --background / --card / --border / --primary (and their --color-* mirrors).
 * It must NEVER touch the semantic (--pos/--neg/--warn/--info/--destructive)
 * or categorical (--cat-1..8) tokens defined in app/globals.css — those carry
 * fixed financial meaning and must stay constant across user hue choices.
 */
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
