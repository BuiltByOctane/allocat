/**
 * Device-local notification preferences (shared by the web ingest path, the
 * Profile toggle, and pushed to the native layer for the closed-app path).
 */
import {
  DEFAULT_NOTIF_SOUND,
  isNotifSoundId,
  type NotifSoundId,
} from "@/lib/native/notifSounds";

const CONFIRM_KEY = "allocat-confirm-autoallocate";
const SOUND_KEY = "allocat-notif-sound";
const INSIGHTS_KEY = "allocat-weekly-insights";

/** Whether to show a subtle confirmation when a known merchant auto-allocates. Default ON. */
export function confirmAutoAllocate(): boolean {
  try {
    return localStorage.getItem(CONFIRM_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setConfirmAutoAllocate(on: boolean): void {
  try {
    localStorage.setItem(CONFIRM_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Selected notification sound. Android-only effect; default is the cat meow. */
export function notifSound(): NotifSoundId {
  try {
    const v = localStorage.getItem(SOUND_KEY);
    return isNotifSoundId(v) ? v : DEFAULT_NOTIF_SOUND;
  } catch {
    return DEFAULT_NOTIF_SOUND;
  }
}

export function setNotifSound(id: NotifSoundId): void {
  try {
    localStorage.setItem(SOUND_KEY, id);
  } catch {
    /* ignore */
  }
}

/** Whether to schedule the weekly AI insight notification. Default ON. */
export function weeklyInsightsEnabled(): boolean {
  try {
    return localStorage.getItem(INSIGHTS_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setWeeklyInsightsEnabled(on: boolean): void {
  try {
    localStorage.setItem(INSIGHTS_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}
