import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

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
  appId: "com.octane.allocat",
  appName: "AlloCat",
  // Required by the CLI even in remote mode (no assets are bundled).
  webDir: "public",
  server: {
    // /dashboard is the offline-first landing:
    //   - online + authed  → app loads normally from this URL
    //   - online + unauthed → server middleware (proxy.ts) redirects to /auth/login
    //   - offline + authed  → Serwist NetworkFirst serves the cached /dashboard
    //                         document shell; React Query re-hydrates from IndexedDB
    // Starting at /auth/login stranded offline users on the login screen because
    // the login page has no meaningful offline fallback and they could never
    // navigate to their cached, IndexedDB-backed app.
    url: process.env.CAP_SERVER_URL || "https://allocat.xyz/dashboard",
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
    // resize:"none" keeps the WebView layout viewport full-screen when the soft
    // keyboard opens, so 100dvh/75dvh never shrink (and never get stuck at the
    // shrunken value after the keyboard hides — the root cause of bottom sheets
    // collapsing to half height). The keyboard overlays the page; the web layer
    // lifts sheets above it via the --keyboard-inset var (KeyboardInset.tsx).
    Keyboard: {
      resize: KeyboardResize.None,
      resizeOnFullScreen: true,
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
