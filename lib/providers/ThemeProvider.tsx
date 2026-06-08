"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Thin wrapper over next-themes. The app ships a single Neo · Lime identity
 * with a light/dark token swap (see app/globals.css); there is no per-user
 * accent customization.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
