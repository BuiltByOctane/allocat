import type { Metadata, Viewport } from "next";
import { Inter_Tight, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/lib/providers/QueryProvider";
import { ThemeProvider } from "@/lib/providers/ThemeProvider";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600"],
});

const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "AlloCat",
  description:
    "A minimalist personal finance control system for disciplined budgeting and financial freedom.",
  keywords: ["budget", "finance", "net worth", "debt", "goals", "personal finance"],
  icons: {
    icon: [
      { url: "/ios/32.png", sizes: "32x32", type: "image/png" },
      { url: "/android/launchericon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/ios/180.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/ios/32.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Budget",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body
        className={`${interTight.variable} ${bricolageGrotesque.variable} ${jetbrainsMono.variable} font-sans antialiased text-foreground bg-background`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
