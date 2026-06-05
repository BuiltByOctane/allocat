import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface CapturedSms {
  sender: string;
  body: string;
  ts: number;
}

export interface SmsReaderPlugin {
  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  /** Returns and clears messages captured while the app was closed. */
  getQueued(): Promise<{ messages: CapturedSms[] }>;
  /** Push current merchant rules so the native receiver can match when closed. */
  setRules(options: { rules: string }): Promise<void>;
  /** Push top budget items (JSON [{id,name}]) for the quick-allocate buttons. */
  setQuickTargets(options: { targets: string }): Promise<void>;
  /** Returns + clears a deep-link stashed when a notification was tapped. */
  consumeDeepLink(): Promise<{ url: string | null }>;
  /** Opens the OEM autostart manager (or the app settings page as fallback). */
  openAutostartSettings(): Promise<void>;
  /** Prompts to exempt the app from battery optimization. */
  openBatterySettings(): Promise<void>;
  /** Opens the app's system settings page. */
  openAppSettings(): Promise<void>;
  addListener(
    eventName: "smsReceived",
    listenerFunc: (msg: CapturedSms) => void,
  ): Promise<PluginListenerHandle>;
}

/** Native-only — guard calls with Capacitor.isNativePlatform(). */
export const SmsReader = registerPlugin<SmsReaderPlugin>("SmsReader");
