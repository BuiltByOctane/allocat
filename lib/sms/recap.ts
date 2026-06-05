/**
 * Weekly recap notification — a reason to open the app each week. Computed from
 * IDB (accurate across foreground + closed-app spends) and scheduled via
 * @capacitor/local-notifications so it fires when the app is closed. Rescheduled
 * on each app open with fresh numbers, rotating four flavors week to week so it
 * never feels like the same boring digest.
 */
import { Capacitor } from "@capacitor/core";
import { getDB } from "@/lib/db";
import { formatCurrency } from "@/lib/number-format";

const RECAP_ID = 920424;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface RecapStats {
  thisTotal: number;
  count: number;
  topCat: string;
  topAmt: number;
  lastTotal: number;
  over: number;
  tracked: number;
  money: (v: number) => string;
}

export async function scheduleWeeklyRecap(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const stats = await computeStats();
    if (!stats) return;
    const { title, body } = pickFlavor(stats);
    const { LocalNotifications } = await import("@capacitor/local-notifications");
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

/** Rotate flavor by week so consecutive weeks differ. */
function pickFlavor(s: RecapStats): { title: string; body: string } {
  const flavor = Math.floor(Date.now() / WEEK_MS) % 4;

  // 3 = vs-last-week, but needs last-week data; fall back to recap.
  if (flavor === 3 && s.lastTotal > 0) {
    const diff = Math.round(((s.thisTotal - s.lastTotal) / s.lastTotal) * 100);
    if (diff <= -5) {
      return {
        title: "🎉 Week over week",
        body: `${s.money(s.thisTotal)} this week — ${Math.abs(diff)}% less than last. Nice restraint.`,
      };
    }
    if (diff >= 5) {
      return {
        title: "👀 The cat's watching",
        body: `${s.money(s.thisTotal)} this week — up ${diff}% on last. Worth a look.`,
      };
    }
    return {
      title: "🐾 Week over week",
      body: `${s.money(s.thisTotal)} this week — about the same as last. Steady.`,
    };
  }

  if (flavor === 2) {
    // Cat-mood report.
    if (s.over > 0) {
      return {
        title: "🙀 The cat's concerned",
        body: `${s.over} budget${s.over > 1 ? "s" : ""} over this week. Tap to regroup.`,
      };
    }
    return {
      title: "😺 Smooth week",
      body: `All ${s.tracked} budgets on track. The cat approves. ${s.money(s.thisTotal)} across ${s.count} spend${s.count > 1 ? "s" : ""}.`,
    };
  }

  if (flavor === 1 && s.topCat) {
    // Next-week challenge.
    return {
      title: "🐾 This week's challenge",
      body: `You spent ${s.money(s.topAmt)} on ${s.topCat}. Think you can beat it? Aim lower this week.`,
    };
  }

  // 0 (and fallbacks): recap + insight.
  const insight = s.topCat
    ? ` ${s.topCat} was your big one.`
    : "";
  return {
    title: "🐾 Your week with AlloCat",
    body: `${s.money(s.thisTotal)} across ${s.count} spend${s.count > 1 ? "s" : ""}.${insight}`,
  };
}

async function computeStats(): Promise<RecapStats | null> {
  const db = getDB();
  const now = Date.now();
  const weekAgo = new Date(now - WEEK_MS).toISOString();
  const twoWeeksAgo = new Date(now - 2 * WEEK_MS).toISOString();

  const all = (await db.sms_transactions.toArray()).filter(
    (t) => t.status === "categorized" && typeof t.amount === "number",
  );
  const thisWk = all.filter((t) => t.created_at >= weekAgo);
  if (thisWk.length === 0) return null;
  const lastWk = all.filter(
    (t) => t.created_at >= twoWeeksAgo && t.created_at < weekAgo,
  );

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
  for (const t of thisWk) {
    const cid = t.budget_item_id ? itemCat.get(t.budget_item_id) : undefined;
    if (cid) byCat.set(cid, (byCat.get(cid) ?? 0) + Number(t.amount));
  }
  let topCat = "";
  let topAmt = 0;
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

  return {
    thisTotal: thisWk.reduce((s, t) => s + Number(t.amount), 0),
    count: thisWk.length,
    topCat,
    topAmt,
    lastTotal: lastWk.reduce((s, t) => s + Number(t.amount), 0),
    over,
    tracked: tracked.length,
    money,
  };
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
