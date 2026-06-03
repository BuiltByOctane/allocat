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
  /** Returns + clears a deep-link stashed when a notification was tapped. */
  consumeDeepLink(): Promise<{ url: string | null }>;
  addListener(
    eventName: "smsReceived",
    listenerFunc: (msg: CapturedSms) => void,
  ): Promise<PluginListenerHandle>;
}

/** Native-only — guard calls with Capacitor.isNativePlatform(). */
export const SmsReader = registerPlugin<SmsReaderPlugin>("SmsReader");
