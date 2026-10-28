/**
 * Pure budget-cycle logic: the single source of truth for "which budget cycle
 * is this date in" and for planning a cycle start-day switch.
 *
 * A cycle with start day N (1–28) runs from day N of its label month to the
 * day before day N of the next month (start 15 ⇒ Oct 15 – Nov 14, labelled
 * October). Stored budgets carry their own `period_start`/`period_end`, which
 * always win over the computed range — after a switch, one stored row can
 * cover an unusual span (e.g. Oct 1 – Nov 14).
 *
 * No Dexie/React/network imports. Date math runs on `{y, m, d}` integers via a
 * day-number conversion — never `Date` UTC methods — so a device timezone can
 * never shift a cycle boundary.
 */

export type ISODate = string; // "YYYY-MM-DD", local calendar date

export interface PeriodLabel {
  month: number; // 1-based
  year: number;
}

/** Inclusive on both ends. */
export interface PeriodRange {
  start: ISODate;
  end: ISODate;
}

/**
 * A stored budget as far as cycle math cares. `period_start`/`period_end` may
 * be missing on a stale cache or an unmigrated DB — such a row is treated as
 * the calendar month of its label.
 */
export interface StoredBudgetPeriod extends PeriodLabel {
  id: string;
  period_start?: ISODate | null;
  period_end?: ISODate | null;
}

export interface ResolvedPeriod extends PeriodLabel, PeriodRange {
  budgetId: string | null;
}

export interface SwitchPlan {
  startDay: number;
  current: { budgetId: string | null; month: number; year: number; start: ISODate; end: ISODate } | null;
  deleteBudgetIds: string[];
  deleteLabels: PeriodLabel[]; // for the preview warning
  redate: Array<{ budgetId: string; start: ISODate; end: ISODate }>;
  nextStart: ISODate | null;
}

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = MONTHS_LONG.map((m) => m.slice(0, 3));

// ── Integer date primitives ────────────────────────────────────────────────

interface YMD { y: number; m: number; d: number }

function parse(date: ISODate): YMD {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

function format({ y, m, d }: YMD): ISODate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** Days since 1970-01-01 for a proleptic Gregorian date (Hinnant's days_from_civil). */
function toDayNumber(date: ISODate): number {
  let { y } = parse(date);
  const { m, d } = parse(date);
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of toDayNumber (Hinnant's civil_from_days). */
function fromDayNumber(n: number): ISODate {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return format({ y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d });
}

function labelIndex(l: PeriodLabel): number {
  return l.year * 12 + (l.month - 1);
}

function labelFromIndex(idx: number): PeriodLabel {
  return { month: (idx % 12) + 1, year: Math.floor(idx / 12) };
}

function stepLabel(l: PeriodLabel, delta: number): PeriodLabel {
  return labelFromIndex(labelIndex(l) + delta);
}

function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

/** Fill a missing stored range with the calendar month of its label. */
function storedRange(b: StoredBudgetPeriod): PeriodRange {
  if (b.period_start && b.period_end) return { start: b.period_start, end: b.period_end };
  return computeRange(b, 1);
}

function resolvedFromStored(b: StoredBudgetPeriod): ResolvedPeriod {
  return { month: b.month, year: b.year, ...storedRange(b), budgetId: b.id };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * The day the user actually chose, or null when none is stored. A profile
 * created after the start-day migration holds null until the user picks
 * (onboarding or their first budget setup); existing users were back-filled
 * with 1. Only an integer 1–28 counts.
 */
export function startDayChoice(n: unknown): number | null {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 28 ? n : null;
}

/**
 * The choice held by a profile ROW. A row without the `budget_start_day` key
 * at all predates the column (a cached profile from before the start-day
 * deploy, or an unmigrated server) and belongs to an existing user, who is
 * "chosen = 1" by the migration's back-fill. Only an explicit null means
 * "not chosen yet". No row ⇒ null (unknown; callers re-read the server).
 */
export function storedStartDayChoice(
  row: { budget_start_day?: unknown } | null | undefined,
): number | null {
  if (!row) return null;
  if (!("budget_start_day" in row) || row.budget_start_day === undefined) return 1;
  return startDayChoice(row.budget_start_day);
}

/** Whether the profile holds a chosen start day (see `startDayChoice`). */
export function isStartDayChosen(n: unknown): boolean {
  return startDayChoice(n) !== null;
}

/**
 * The EFFECTIVE start day for date maths: the stored choice, else 1. An
 * unchosen (null) day therefore behaves as calendar months everywhere.
 */
export function clampStartDay(n: unknown): number {
  return startDayChoice(n) ?? 1;
}

/** Local calendar date of `d` (getFullYear/getMonth/getDate, not UTC). */
export function toISODate(d: Date): ISODate {
  return format({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
}

export function addDays(date: ISODate, n: number): ISODate {
  return fromDayNumber(toDayNumber(date) + n);
}

/** The cycle labelled `label` for `startDay`: day N of the month → day N−1 next month. */
export function computeRange(label: PeriodLabel, startDay: number): PeriodRange {
  const next = stepLabel(label, 1);
  return {
    start: format({ y: label.year, m: label.month, d: startDay }),
    end: addDays(format({ y: next.year, m: next.month, d: startDay }), -1),
  };
}

/** The label of the computed cycle containing `date`. */
export function labelForDate(date: ISODate, startDay: number): PeriodLabel {
  const { y, m, d } = parse(date);
  const label = { month: m, year: y };
  return d >= startDay ? label : stepLabel(label, -1);
}

/**
 * The cycle containing `date`. A stored budget whose range contains it wins.
 * Otherwise the computed cycle for `startDay`, clipped to the gap between the
 * neighbouring stored budgets so it never overlaps one; `budgetId` is set only
 * when a stored row with that label has exactly the resulting range.
 */
export function resolvePeriod(date: ISODate, budgets: StoredBudgetPeriod[], startDay: number): ResolvedPeriod {
  let prevEnd: ISODate | null = null;
  let nextStart: ISODate | null = null;
  for (const b of budgets) {
    const r = storedRange(b);
    if (r.start <= date && date <= r.end) return resolvedFromStored(b);
    if (r.end < date && (prevEnd === null || r.end > prevEnd)) prevEnd = r.end;
    if (r.start > date && (nextStart === null || r.start < nextStart)) nextStart = r.start;
  }

  const label = labelForDate(date, startDay);
  const computed = computeRange(label, startDay);
  const start = prevEnd === null ? computed.start : maxDate(computed.start, addDays(prevEnd, 1));
  const end = nextStart === null ? computed.end : minDate(computed.end, addDays(nextStart, -1));

  const match = budgets.find((b) => {
    if (labelIndex(b) !== labelIndex(label)) return false;
    const r = storedRange(b);
    return r.start === start && r.end === end;
  });
  return { ...label, start, end, budgetId: match?.id ?? null };
}

/** The cycle for an explicit label: its stored row wins, else the computed range. */
export function rangeForLabel(label: PeriodLabel, budgets: StoredBudgetPeriod[], startDay: number): ResolvedPeriod {
  const stored = budgets.find((b) => labelIndex(b) === labelIndex(label));
  if (stored) return resolvedFromStored(stored);
  return { month: label.month, year: label.year, ...computeRange(label, startDay), budgetId: null };
}

/**
 * The stored budget that absorbed `range`'s label: one with a DIFFERENT label
 * whose range contains `range.start` (e.g. after a 15 → 1 switch, October
 * stretched to Oct 15 – Nov 30 swallows November). Null when the label has
 * its own stored row or nothing covers it.
 */
export function findCoveringBudget(
  range: ResolvedPeriod,
  budgets: StoredBudgetPeriod[],
): StoredBudgetPeriod | null {
  if (range.budgetId !== null) return null;
  return (
    budgets.find((b) => {
      if (labelIndex(b) === labelIndex(range)) return false;
      const r = storedRange(b);
      return r.start <= range.start && range.start <= r.end;
    }) ?? null
  );
}

/** Whether a stored budget's range (missing ⇒ calendar month of its label) contains `date`. */
export function budgetContainsDate(b: StoredBudgetPeriod, date: ISODate): boolean {
  const r = storedRange(b);
  return r.start <= date && date <= r.end;
}

/**
 * A stored budget whose range intersects `range` anywhere (full interval
 * overlap, not just the start), ignoring `range.budgetId` itself. Creating a
 * budget for `range` while this is non-null would be refused by the server's
 * `budget_period_overlap` guard.
 */
export function findOverlappingBudget<T extends StoredBudgetPeriod>(
  range: PeriodRange & { budgetId?: string | null },
  budgets: T[],
): T | null {
  return (
    budgets.find((b) => {
      if (range.budgetId && b.id === range.budgetId) return false;
      const r = storedRange(b);
      return r.start <= range.end && range.start <= r.end;
    }) ?? null
  );
}

/**
 * The budget row behind a resolved period: the row with `period.budgetId` if
 * present among `candidates` (a temp id may have been swapped by sync), else a
 * row with the same label whose range contains `date`. A same-label row that
 * does NOT cover the date is someone else's cycle and is rejected.
 */
export function pickBudgetForPeriod<T extends StoredBudgetPeriod>(
  period: ResolvedPeriod,
  candidates: T[],
  date: ISODate,
): T | undefined {
  if (period.budgetId) {
    const byId = candidates.find((b) => b.id === period.budgetId);
    if (byId) return byId;
  }
  return candidates.find(
    (b) => labelIndex(b) === labelIndex(period) && budgetContainsDate(b, date),
  );
}

/**
 * The adjacent cycle. Steps by date, not label, so a label absorbed into a
 * longer stored budget is skipped by construction.
 */
export function stepResolved(
  cur: ResolvedPeriod,
  delta: 1 | -1,
  budgets: StoredBudgetPeriod[],
  startDay: number,
): ResolvedPeriod {
  const date = delta === 1 ? addDays(cur.end, 1) : addDays(cur.start, -1);
  return resolvePeriod(date, budgets, startDay);
}

/** Inclusive day count of the range. */
export function periodDays(r: PeriodRange): number {
  return toDayNumber(r.end) - toDayNumber(r.start) + 1;
}

/** 1 on the start day; clamped to [0, periodDays] when `today` is outside the range. */
export function daysElapsed(r: PeriodRange, today: ISODate): number {
  const n = toDayNumber(today) - toDayNumber(r.start) + 1;
  return Math.min(Math.max(n, 0), periodDays(r));
}

/** 0 on the end day; clamped to [0, periodDays] when `today` is outside the range. */
export function daysLeft(r: PeriodRange, today: ISODate): number {
  const n = toDayNumber(r.end) - toDayNumber(today);
  return Math.min(Math.max(n, 0), periodDays(r));
}

/**
 * "October 2026" for a full calendar month under start day 1; otherwise an
 * en-US short range like "Oct 15 – Nov 14".
 */
export function formatPeriodLabel(r: ResolvedPeriod, startDay: number): string {
  const calendar = computeRange(r, 1);
  if (startDay === 1 && r.start === calendar.start && r.end === calendar.end) {
    return `${MONTHS_LONG[r.month - 1]} ${r.year}`;
  }
  const s = parse(r.start);
  const e = parse(r.end);
  return `${MONTHS_SHORT[s.m - 1]} ${s.d} – ${MONTHS_SHORT[e.m - 1]} ${e.d}`;
}

/**
 * Plan a switch from `oldStartDay` to `newStartDay`. The current cycle keeps
 * its start and is stretched/shrunk to end the day before the first new-style
 * cycle that starts after today. Future labels swallowed by that stretch are
 * deleted; later future budgets are redated to the new start day. Budgets at
 * or before the current label are untouched. If today sits in an unstored gap
 * whose label already belongs to a stored budget, that budget becomes the
 * current one and is stretched across the gap. `null` when nothing changes.
 */
export function planStartDaySwitch(input: {
  today: ISODate;
  oldStartDay: number;
  newStartDay: number;
  budgets: StoredBudgetPeriod[];
}): SwitchPlan | null {
  const { today, budgets } = input;
  const oldStartDay = clampStartDay(input.oldStartDay);
  const startDay = clampStartDay(input.newStartDay);
  if (startDay === oldStartDay) return null;

  if (budgets.length === 0) {
    return { startDay, current: null, deleteBudgetIds: [], deleteLabels: [], redate: [], nextStart: null };
  }

  let cur = resolvePeriod(today, budgets, oldStartDay);
  // A clipped gap can carry the label of an existing stored budget (stored
  // Sep 1–30, start day 15, today Oct 5 ⇒ label Sep). Creating a second row
  // with that label would collide, so stretch the stored one across the gap
  // instead — it ends right before the gap, so the result stays contiguous.
  if (cur.budgetId === null) {
    const owner = budgets.find((b) => labelIndex(b) === labelIndex(cur) && storedRange(b).end < today);
    if (owner) cur = { ...cur, budgetId: owner.id, start: storedRange(owner).start };
  }
  let next = stepLabel(cur, 1);
  let s = computeRange(next, startDay).start;
  while (s <= today) {
    next = stepLabel(next, 1);
    s = computeRange(next, startDay).start;
  }

  const deleteBudgetIds: string[] = [];
  const deleteLabels: PeriodLabel[] = [];
  const redate: SwitchPlan["redate"] = [];
  const curIdx = labelIndex(cur);
  const nextIdx = labelIndex(next);
  for (const b of budgets) {
    const idx = labelIndex(b);
    if (idx <= curIdx) continue;
    if (idx < nextIdx) {
      deleteBudgetIds.push(b.id);
      deleteLabels.push({ month: b.month, year: b.year });
    } else {
      redate.push({ budgetId: b.id, ...computeRange(b, startDay) });
    }
  }

  return {
    startDay,
    current: { budgetId: cur.budgetId, month: cur.month, year: cur.year, start: cur.start, end: addDays(s, -1) },
    deleteBudgetIds,
    deleteLabels,
    redate,
    nextStart: s,
  };
}
