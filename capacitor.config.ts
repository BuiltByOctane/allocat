import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Remote-URL WebView mode: the native shell loads the deployed Next.js app so
 * server actions, SSR and the offline-first IDB layer keep working unchanged.
 * The native SMS plugin (android/) bridges incoming transaction SMS into the
 * web layer via the SmsReader plugin events.
 *
 * Override the URL for LAN device testing:
 *   CAP_SERVER_URL=http://192.168.1.20:3000 npx cap sync
 */
const config: CapacitorConfig = {
  appId: "app.allocat.mobile",
  appName: "AlloCat",
  // Required by the CLI even in remote mode (no assets are bundled).
  webDir: "public",
  server: {
    url: process.env.CAP_SERVER_URL || "https://allocat.xyz/auth/login",
    androidScheme: "https",
    // Allow cleartext only when overriding with an http LAN dev URL.
    cleartext: (process.env.CAP_SERVER_URL ?? "").startsWith("http://"),
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_notification",
      iconColor: "#FFFFFF",
    },
  },
};

export default config;
