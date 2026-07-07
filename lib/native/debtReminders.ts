/**
 * Local scheduled reminders for money lent to friends.
 *
 * Models lib/sms/recap.ts: schedules @capacitor/local-notifications that fire
 * even when the app is closed. Rescheduled on each app open with fresh IDB data,
 * so the set always reflects current "lent" debts and their due dates.
 *
 * Each lend with a future `expected_payoff_date` gets one notification fired at
 * 10:00 local on the due day. Ids are derived deterministically from the debt id
 * inside a fixed band (so reschedule is idempotent and never collides with the
 * weekly recap notification in recap.ts).
 */
import { Capacitor } from "@capacitor/core";
import { getDB } from "@/lib/db";
import { formatCurrency } from "@/lib/number-format";
import { debtRemindersEnabled } from "@/lib/sms/notifPrefs";

// Notification id band reserved for debt reminders. RECAP_ID (920424) sits well
// outside this range, so the two schedulers never clash.
const BAND_BASE = 930000;
const BAND_SIZE = 10000;
const BAND_MAX = BAND_BASE + BAND_SIZE; // exclusive upper bound

/** Stable string→int hash (djb2) folded into the reserved id band. */
function debtNotifId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = (h * 33) ^ id.charCodeAt(i);
  }
  return BAND_BASE + (Math.abs(h) % BAND_SIZE);
}

/** The due date at 10:00 local. Returns null if not in the future. */
function dueAt(dateStr: string): Date | null {
  // Parse as a local calendar day (date inputs are stored as YYYY-MM-DD).
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const at = new Date(y, m - 1, d, 10, 0, 0, 0);
  if (at.getTime() <= Date.now()) return null;
  return at;
}

export async function scheduleDebtReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    // Always clear our band first so reschedule is idempotent — and so turning
    // the toggle off (early return below) leaves no stale reminders pending.
    const { notifications: pending } = await LocalNotifications.getPending();
    const stale = pending
      .map((n) => n.id)
      .filter((id) => id >= BAND_BASE && id < BAND_MAX);
    if (stale.length > 0) {
      await LocalNotifications.cancel({
        notifications: stale.map((id) => ({ id })),
      });
    }

    if (!debtRemindersEnabled()) return;

    const lents = await getDB()
      .debts.where("type")
      .equals("lent")
      .toArray();

    const toSchedule: {
      id: number;
      title: string;
      body: string;
      schedule: { at: Date; allowWhileIdle: boolean };
      extra: { url: string };
    }[] = [];

    for (const lent of lents) {
      if (lent.is_closed) continue;
      if (!lent.expected_payoff_date) continue;
      const at = dueAt(lent.expected_payoff_date);
      if (!at) continue;

      const remaining = Math.max(
        0,
        Number(lent.principal) - Number(lent.total_paid),
      );
      if (remaining <= 0) continue;

      // Debts carry no per-row currency; fall back to the legacy default.
      const amount = formatCurrency(remaining, { code: "INR" });

      toSchedule.push({
        id: debtNotifId(lent.id),
        title: "🐱 Payday whiskers",
        body: `${lent.name} owes you ${amount}, due today. Time for a gentle nudge.`,
        schedule: { at, allowWhileIdle: true },
        extra: { url: "/debt" },
      });
    }

    if (toSchedule.length === 0) return;
    await LocalNotifications.schedule({ notifications: toSchedule });
  } catch {
    /* best-effort */
  }
}
