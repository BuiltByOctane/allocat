/**
 * Runtime feature flags, stored in `app_config.flags` (jsonb) and served by
 * /api/app-config.
 *
 * These exist because every NEXT_PUBLIC_* switch is inlined at build time, so
 * turning one off means a redeploy — useless when the thing you need to switch
 * off is already live in a shipped Android build. Flags are kill switches, not
 * a config system: keep the list short and the semantics boolean-obvious.
 *
 * Defaults are "everything on", so a missing or corrupt row can never dark the app.
 */
export interface AppFlags {
  ai_enabled: boolean;
  sms_enabled: boolean;
  /** Founding-member offer accepting claims (Support page + banner). Off = "spots closed". */
  founding_offer_open: boolean;
  /** Show the slim founding-offer banner on the dashboard. */
  founding_banner_visible: boolean;
  /** Daily AI message ceiling per account. */
  daily_ai_messages: number;
  /** PostHog product analytics + session replay (lib/analytics/client.ts). */
  analytics_enabled: boolean;
}

export const DEFAULT_FLAGS: AppFlags = {
  ai_enabled: true,
  sms_enabled: true,
  founding_offer_open: true,
  founding_banner_visible: true,
  daily_ai_messages: 30,
  analytics_enabled: true,
};

export const FLAG_KEYS = Object.keys(DEFAULT_FLAGS) as Array<keyof AppFlags>;

/** Tolerant parse: unknown keys are dropped, wrong types fall back to default. */
export function parseFlags(raw: unknown): AppFlags {
  const out = { ...DEFAULT_FLAGS };
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;

  for (const key of FLAG_KEYS) {
    const v = obj[key];
    if (typeof DEFAULT_FLAGS[key] === "boolean" && typeof v === "boolean") {
      (out[key] as boolean) = v;
    } else if (typeof DEFAULT_FLAGS[key] === "number" && typeof v === "number" && v > 0) {
      (out[key] as number) = Math.floor(v);
    }
  }
  return out;
}
