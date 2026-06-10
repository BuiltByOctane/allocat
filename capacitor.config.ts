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
    // Android 15+ forces edge-to-edge. "css" makes the WebView draw behind the
    // (transparent) status + navigation bars, so the page's own background fills
    // those zones — it follows ANY in-app theme/accent because it's the real
    // rendered pixels, not a native colour guess. Capacitor injects
    // --safe-area-inset-* / env(safe-area-inset-*) so the web layer can pad
    // content clear of the bars. Bar icon colour is set at runtime per the
    // active <html>.dark theme via SystemBars.setStyle (see NativeShell).
    SystemBars: {
      insetsHandling: "css",
      style: "DEFAULT",
    },
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
      backgroundColor: "#000000",
      androidScaleType: "CENTER_INSIDE",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
