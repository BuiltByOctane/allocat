/**
 * Weekly recap notification. Computed from IDB (accurate across all spends —
 * foreground + closed-app) and scheduled via @capacitor/local-notifications, so
 * it fires even when the app is closed. Rescheduled on each app open with fresh
 * numbers (a one-shot for the upcoming Sunday, replaced each time by stable id).
 */
import { Capacitor } from "@capacitor/core";
import { getDB } from "@/lib/db";
import { formatCurrency } from "@/lib/number-format";

const RECAP_ID = 920424;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function scheduleWeeklyRecap(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const body = await computeRecapBody();
    if (!body) return;
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [
        {
          id: RECAP_ID,
          title: "🐾 Your week with AlloCat",
          body,
          schedule: { at: nextSunday1900(), allowWhileIdle: true },
          extra: { url: "/dashboard" },
        },
      ],
    });
  } catch {
    /* ignore — scheduling is best-effort */
  }
}

async function computeRecapBody(): Promise<string | null> {
  const db = getDB();
  const sinceIso = new Date(Date.now() - WEEK_MS).toISOString();

  const txns = (await db.sms_transactions.toArray()).filter(
    (t) =>
      t.status === "categorized" &&
      typeof t.amount === "number" &&
      t.created_at >= sinceIso,
  );
  if (txns.length === 0) return null;

  const total = txns.reduce((s, t) => s + Number(t.amount), 0);
  const count = txns.length;

  const [items, cats, profiles] = await Promise.all([
    db.budget_items.toArray(),
    db.categories.toArray(),
    db.profiles.toArray(),
  ]);
  const itemCat = new Map(items.map((i) => [i.id, i.category_id]));
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const code = profiles[0]?.currency ?? "INR";
  const money = (v: number) =>
    formatCurrency(v, { code, maximumFractionDigits: 0 });

  const byCat = new Map<string, number>();
  for (const t of txns) {
    const cid = t.budget_item_id ? itemCat.get(t.budget_item_id) : undefined;
    if (cid) byCat.set(cid, (byCat.get(cid) ?? 0) + Number(t.amount));
  }
  let topCat = "";
  let topAmt = -1;
  for (const [cid, amt] of byCat) {
    if (amt > topAmt) {
      topAmt = amt;
      topCat = catName.get(cid) ?? "";
    }
  }

  const tracked = items.filter((i) => Number(i.planned_amount) > 0);
  const over = tracked.filter(
    (i) => Number(i.actual_amount) > Number(i.planned_amount),
  ).length;
  const trackLine =
    over === 0
      ? `All ${tracked.length} budgets on track — nice. 😺`
      : `${over} budget${over > 1 ? "s" : ""} over, ${tracked.length - over} on track.`;

  return `${money(total)} across ${count} spend${count > 1 ? "s" : ""}.${
    topCat ? ` Top: ${topCat}.` : ""
  } ${trackLine}`;
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
