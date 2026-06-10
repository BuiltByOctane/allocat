/**
 * Weekly insight notification — a useful reason to open the app each week.
 *
 * Generated while the app is open (so the AI call has network + a session) and
 * scheduled via @capacitor/local-notifications so it fires Sunday 19:00 even
 * when the app is closed. Rescheduled on each app open with fresh data.
 *
 * Text resolution: a 24h-cached insight → a fresh AI insight
 * (`generateWeeklyInsight`) → an offline template (`pickFlavor`). The cache also
 * rate-limits the AI call, since SmsBridge re-runs this on every app focus.
 */
import { Capacitor } from "@capacitor/core";
import {
  computeInsightStats,
  pickFlavor,
  type InsightStats,
} from "@/lib/sms/insightStats";
import { generateWeeklyInsight } from "@/lib/actions/insights";
import { weeklyInsightsEnabled } from "@/lib/sms/notifPrefs";

const RECAP_ID = 920424;
const CACHE_KEY = "allocat-insight-cache";
const AI_TTL_MS = 24 * 60 * 60 * 1000; // reuse a good AI insight for a day
const FALLBACK_TTL_MS = 60 * 60 * 1000; // retry AI ~hourly after a failure

interface Insight {
  title: string;
  body: string;
}

interface CachedInsight extends Insight {
  ts: number;
  ai: boolean;
}

export async function scheduleWeeklyRecap(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    // Respect the user's toggle — cancel any pending insight when turned off.
    if (!weeklyInsightsEnabled()) {
      await LocalNotifications.cancel({ notifications: [{ id: RECAP_ID }] });
      return;
    }

    const stats = await computeInsightStats();
    if (!stats) return;

    const { title, body } = await resolveInsight(stats);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: RECAP_ID,
          title,
          body,
          schedule: { at: nextSunday1900(), allowWhileIdle: true },
          extra: { url: "/dashboard" },
        },
      ],
    });
  } catch {
    /* best-effort */
  }
}

/** Cached insight → fresh AI insight → offline template. */
async function resolveInsight(stats: InsightStats): Promise<Insight> {
  const cached = readCache();
  if (cached) return { title: cached.title, body: cached.body };

  const ai = await generateWeeklyInsight(stats);
  if (ai) {
    writeCache({ ...ai, ts: Date.now(), ai: true });
    return ai;
  }

  const tmpl = pickFlavor(stats);
  writeCache({ ...tmpl, ts: Date.now(), ai: false });
  return tmpl;
}

function readCache(): CachedInsight | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedInsight;
    const ttl = c.ai ? AI_TTL_MS : FALLBACK_TTL_MS;
    if (Date.now() - c.ts > ttl) return null;
    return c;
  } catch {
    return null;
  }
}

function writeCache(c: CachedInsight): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

/** Upcoming Sunday at 19:00 local (or next week's if already past). */
function nextSunday1900(): Date {
  const d = new Date();
  d.setHours(19, 0, 0, 0);
  let add = (7 - d.getDay()) % 7; // 0 = Sunday
  if (add === 0 && Date.now() > d.getTime()) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}
