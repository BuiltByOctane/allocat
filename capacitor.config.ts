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
      iconColor: "#F4A340",
    },
    // Remote-URL mode loads the deployed app over the network, so the native
    // splash must stay up until the WebView is ready — otherwise users see a
    // blank WebView during the load. Auto-hide is disabled here; the web layer
    // calls SplashScreen.hide() once it mounts (see NativeShell).
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#ffffff",
      androidScaleType: "CENTER_INSIDE",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
