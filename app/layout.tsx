import type { Metadata, Viewport } from "next";
import { Inter_Tight, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/lib/providers/QueryProvider";
import { ThemeProvider } from "@/lib/providers/ThemeProvider";
import RegisterPWA from "@/components/ui/RegisterPWA";

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
  metadataBase: new URL("https://allocat.app"),
  title: {
    default: "AlloCat — Personal Finance, Budgeting & Net Worth Tracker",
    template: "%s · AlloCat",
  },
  description:
    "AlloCat is a minimalist, offline-first personal finance PWA. Track budgets, debts, goals, and net worth in INR with AI-powered insights. Free to use.",
  applicationName: "AlloCat",
  keywords: [
    "allocat",
    "allocat app",
    "budgeting app",
    "personal finance",
    "expense tracker",
    "net worth tracker",
    "debt tracker",
    "financial goals",
    "offline budget app",
    "PWA budget app",
    "INR budget tracker",
    "budgeting India",
    "money manager",
  ],
  authors: [{ name: "AlloCat" }],
  creator: "AlloCat",
  publisher: "AlloCat",
  category: "finance",
  alternates: {
    canonical: "https://allocat.app",
  },
  openGraph: {
    type: "website",
    url: "https://allocat.app",
    siteName: "AlloCat",
    title: "AlloCat — Personal Finance, Budgeting & Net Worth Tracker",
    description:
      "Offline-first personal finance PWA. Track budgets, debts, goals, and net worth — with AI insights.",
    locale: "en_IN",
    images: [
      {
        url: "/allocat-logo.png",
        width: 1200,
        height: 630,
        alt: "AlloCat — Personal Finance PWA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AlloCat — Personal Finance & Budgeting",
    description:
      "Offline-first personal finance PWA. Budgets, debts, goals, net worth — with AI insights.",
    images: ["/allocat-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
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
    title: "AlloCat",
  },
  formatDetection: {
    telephone: false,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://allocat.app/#organization",
      name: "AlloCat",
      url: "https://allocat.app",
      logo: "https://allocat.app/allocat-logo.png",
      sameAs: ["https://grow.allocat.app"],
    },
    {
      "@type": "WebSite",
      "@id": "https://allocat.app/#website",
      name: "AlloCat",
      url: "https://allocat.app",
      publisher: { "@id": "https://allocat.app/#organization" },
    },
    {
      "@type": "SoftwareApplication",
      name: "AlloCat",
      alternateName: "Allocat",
      applicationCategory: "FinanceApplication",
      applicationSubCategory: "Personal Finance, Budgeting, Net Worth Tracker",
      operatingSystem: "Web, Android, iOS, Windows, macOS",
      url: "https://allocat.app",
      description:
        "Minimalist, offline-first personal finance PWA. Track budgets, debts, goals, and net worth with AI-powered insights.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    },
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
          <RegisterPWA />
        </ThemeProvider>
      </body>
    </html>
  );
}
