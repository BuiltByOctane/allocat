# Budget Cycle Start Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each user pick the day their budget month starts (1–28) so a budget runs payday → day before next payday, everywhere the app means "this month".

**Architecture:** A per-user `profiles.budget_start_day` plus frozen `budgets.period_start/period_end`, stamped by a Postgres insert trigger. One pure module (`lib/budget/period.ts`) answers "which period is this date in" (stored budget ranges win, else computed from the start day) and plans a mid-cycle switch. Every calendar-month call site is moved onto it via thin IDB / server / React-Query accessors. The switch is a direct server action (like `updateUserCurrency`) that recomputes the plan server-side and applies it atomically through one RPC.

**Tech Stack:** Next.js 16 server actions, Supabase Postgres (plpgsql trigger + RPC), Dexie v20, TanStack Query 5, Vitest, Capacitor Java (SmsRules).

**Spec:** `docs/superpowers/specs/2026-10-28-budget-cycle-start-day-design.md`

## Global Constraints

- Start day range: integer 1–28, default 1. No 29–31.
- Cycle for label (month M, year Y), start day d: `M/d/Y` → day before `(M+1)/d`. Label = month the cycle starts in.
- Dates are local calendar dates as `"YYYY-MM-DD"` strings; never compare via UTC `toISOString().slice(0,10)` on the client.
- Existing users: backfill `period_start = first of month`, `period_end = last of month`; behaviour identical at start day 1.
- Past budgets (`period_end < today`) are never modified.
- Header label: start day 1 → `"October 2026"` (unchanged); otherwise `"Oct 15 – Nov 14"`.
- Switch preview copy (exact): `"Your current budget will run {start} – {end} ({n} days). From then on, each budget runs {ordinal(d)} → {ordinal(d-1 or last day)}."`; absorbed-budget warning: `"Your {Month} plan will be removed. {CurrentMonth} now runs until {end}."`
- Dashboard discovery card copy: `"Salary not on the 1st? Match your budget to payday."`
- Onboarding question: `"When does your salary arrive?"` — options *1st of the month* / *Pick a date* / *No fixed salary* (⇒ 1).
- Net-worth history, activity log, and TransactionsPage month grouping stay on calendar months.
- Server actions use `getAuthedUser()`; never `auth.getUser()`.
- Use pnpm; commit subjects one short line.

## Review Focus

1. **Year wrap** — start day 15, label Dec 2026 ⇒ 15 Dec 2026 – 14 Jan 2027; a 3 Jan 2027 spend resolves to Dec 2026. (test in Task 2)
2. **Boundary day** — a spend on the start day itself belongs to the NEW cycle; on the day before, the old one. (Task 2)
3. **Start day 1 is byte-for-byte today's behaviour** — computed ranges equal calendar months incl. Feb in leap years (2028-02-29). (Task 2)
4. **Old native APK + new web** — users on start day 1 must keep fresh native notifications (mirror keeps sending `"YYYY-MM"`). (Task 5)
5. **Absorbed label via URL** — `/budget?month=11&year=2026` when Nov is absorbed must not create an overlapping budget; the trigger rejects it and the page shows the covering budget instead. (Task 1 SQL test + Task 7)

---

### Task 1: Schema, trigger, RPC, types, Dexie v20

**Files:**
- Create: `supabase/migrations/20261028000000_budget_cycle_start_day.sql`
- Modify: `lib/types/database.ts` (profiles Row/Insert/Update; budgets Row/Insert/Update)
- Modify: `lib/db/AllocatDB.ts` (add `version(20)`)

**Interfaces:**
- Produces: `profiles.budget_start_day: number`; `budgets.period_start: string`, `budgets.period_end: string` (Row non-null, Insert optional); RPC `apply_budget_cycle_switch(p_plan jsonb) returns void`.

- [ ] **Step 1: Write the migration**
  - `alter table profiles add column if not exists budget_start_day smallint not null default 1 check (budget_start_day between 1 and 28);`
  - `alter table budgets add column period_start date, add column period_end date;` backfill `period_start = make_date(year, month, 1)`, `period_end = (make_date(year, month, 1) + interval '1 month' - interval '1 day')::date`; then `set not null` on both.
  - `create function budget_period_range(p_month int, p_year int, p_day int) returns table(start_date date, end_date date)` — `start = make_date(y, m, d)`, `end = start + interval '1 month' - 1 day`.
  - `before insert` trigger `budgets_stamp_period` (`security definer`, `set search_path = public`): if `new.period_start is null`, read `budget_start_day` from `profiles where id = new.user_id` (coalesce 1) and stamp via `budget_period_range`. Then `raise exception 'budget_period_overlap'` if any other budget of `new.user_id` has `period_start <= new.period_end and period_end >= new.period_start`.
  - `apply_budget_cycle_switch(p_plan jsonb)` — `security invoker` (RLS scopes to own rows), single transaction. Plan shape (produced by Task 2's `planStartDaySwitch`, serialised by Task 8):
    ```json
    { "startDay": 15,
      "current": { "budgetId": "uuid|null", "month": 10, "year": 2026, "start": "2026-10-01", "end": "2026-11-14" },
      "deleteBudgetIds": ["uuid"],
      "redate": [{ "budgetId": "uuid", "start": "2026-12-15", "end": "2027-01-14" }] }
    ```
    Order: update `profiles.budget_start_day` for `auth.uid()`; delete `deleteBudgetIds` (cascade removes categories/items); apply `redate` (furthest-future first, so no transient overlap); update the current budget's `period_end` if `budgetId` set, else insert `(auth.uid(), month, year, 0, start, end)`. `current` may be `null` (no-budget user: profile update only). Grant execute to `authenticated`.
- [ ] **Step 2: Apply locally and probe**
  Run the migration against the dev Supabase (SQL editor or `supabase db push`). Probe in SQL: insert two budgets for one user with overlapping explicit dates ⇒ expect `ERROR: budget_period_overlap`; insert with null dates for a profile with `budget_start_day = 15`, month 12 year 2026 ⇒ expect `2026-12-15 / 2027-01-14`.
- [ ] **Step 3: Update `lib/types/database.ts`** for the three new columns and add `apply_budget_cycle_switch` under `Functions` (`Args: { p_plan: Json }`, `Returns: undefined`).
- [ ] **Step 4: Dexie `version(20)`** — no index change; `upgrade` deletes `sync_meta` entries `"budgets"` and `"profiles"` (forces re-pull of new columns), with a v20 comment matching the existing style.
- [ ] **Step 5: Typecheck** — `npx tsc --noEmit`. Expected: errors ONLY at IDB budget-row literals missing `period_start/period_end` (fixed in Task 3). Note the list.
- [ ] **Step 6: Commit** — `feat(budget): cycle start day schema, trigger and switch RPC`

### Task 2: Pure period module

**Files:**
- Create: `lib/budget/period.ts`
- Test: `lib/budget/period.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ISODate = string; // "YYYY-MM-DD", local calendar date
  export interface PeriodLabel { month: number; year: number }        // month 1-based
  export interface PeriodRange { start: ISODate; end: ISODate }        // inclusive
  export interface StoredBudgetPeriod extends PeriodLabel { id: string; period_start: ISODate; period_end: ISODate }
  export interface ResolvedPeriod extends PeriodLabel, PeriodRange { budgetId: string | null }
  export function clampStartDay(n: unknown): number                    // non-int/out of range → 1..28
  export function toISODate(d: Date): ISODate                          // local fields, not UTC
  export function addDays(date: ISODate, n: number): ISODate
  export function computeRange(label: PeriodLabel, startDay: number): PeriodRange
  export function labelForDate(date: ISODate, startDay: number): PeriodLabel
  export function resolvePeriod(date: ISODate, budgets: StoredBudgetPeriod[], startDay: number): ResolvedPeriod
  export function rangeForLabel(label: PeriodLabel, budgets: StoredBudgetPeriod[], startDay: number): ResolvedPeriod
  export function stepResolved(cur: ResolvedPeriod, delta: 1 | -1, budgets: StoredBudgetPeriod[], startDay: number): ResolvedPeriod
  export function periodDays(r: PeriodRange): number                   // inclusive count
  export function daysElapsed(r: PeriodRange, today: ISODate): number  // 1 on start day
  export function daysLeft(r: PeriodRange, today: ISODate): number     // 0 on end day
  export function formatPeriodLabel(r: ResolvedPeriod, startDay: number): string
  export interface SwitchPlan {
    startDay: number;
    current: { budgetId: string | null; month: number; year: number; start: ISODate; end: ISODate } | null;
    deleteBudgetIds: string[];
    deleteLabels: PeriodLabel[];   // for the preview warning
    redate: Array<{ budgetId: string; start: ISODate; end: ISODate }>;
    nextStart: ISODate | null;
  }
  export function planStartDaySwitch(input: { today: ISODate; oldStartDay: number; newStartDay: number; budgets: StoredBudgetPeriod[] }): SwitchPlan | null
  ```
- Rules: `resolvePeriod` — a stored budget whose `[period_start, period_end]` contains `date` wins (budgetId set); otherwise the computed label/range for `startDay`, with `budgetId` = id of a stored budget with that label only if its stored range equals the computed one, else null. `rangeForLabel` — stored row for the label wins, else computed. `stepResolved(+1)` = `resolvePeriod(addDays(cur.end, 1))`; `(-1)` = `resolvePeriod(addDays(cur.start, -1))` (absorbed labels are skipped by construction). `formatPeriodLabel`: startDay 1 AND range is a full calendar month → `"October 2026"`, else `"Oct 15 – Nov 14"` (en-US short month).
- `planStartDaySwitch` algorithm:
  1. `newStartDay === oldStartDay` → `null`.
  2. No budgets at all → `{ startDay, current: null, deleteBudgetIds: [], deleteLabels: [], redate: [], nextStart: null }`.
  3. `cur = resolvePeriod(today, budgets, oldStartDay)`.
  4. `L = cur label + 1 month`; loop `s = computeRange(L, newStartDay).start`; while `s <= today`, `L += 1 month`.
  5. `current = { budgetId: cur.budgetId, month/year: cur label, start: cur.start, end: addDays(s, -1) }`; `nextStart = s`.
  6. Each stored budget with label after `cur` label: label before `L` → delete (id + label); otherwise → redate to `computeRange(label, newStartDay)`. Budgets at or before `cur` label are untouched.

- [ ] **Step 1: Write failing tests** (`describe("period")`) — exact assertions:
  - `computeRange({month:10,year:2026},15)` → `{start:"2026-10-15", end:"2026-11-14"}`; `({month:12,year:2026},15)` → `{"2026-12-15","2027-01-14"}`; `({month:2,year:2028},1)` → `{"2028-02-01","2028-02-29"}`; `({month:1,year:2026},28)` → `{"2026-01-28","2026-02-27"}`.
  - `labelForDate("2026-10-14",15)` → `{9,2026}`; `("2026-10-15",15)` → `{10,2026}`; `("2027-01-03",15)` → `{12,2026}`; `("2026-10-31",1)` → `{10,2026}`.
  - `resolvePeriod` stored-wins: budgets `[{id:"oct",month:10,year:2026,period_start:"2026-10-01",period_end:"2026-11-14"}]`, startDay 15, date `"2026-11-10"` → `{month:10, budgetId:"oct", end:"2026-11-14"}`; date `"2026-11-15"` → `{month:11, start:"2026-11-15", budgetId:null}`.
  - `stepResolved` skips absorbed: budgets `[oct: 2026-10-15..2026-11-30]`, startDay 1, from oct `+1` → `{month:12,year:2026,start:"2026-12-01"}`; from that `-1` → `budgetId:"oct"`.
  - `daysElapsed({start:"2026-10-15",end:"2026-11-14"},"2026-10-15")` → 1; `daysLeft(same,"2026-11-14")` → 0; `periodDays(same)` → 31.
  - `formatPeriodLabel` → `"October 2026"` for startDay 1 calendar range; `"Oct 15 – Nov 14"` for startDay 15.
  - `clampStartDay(0)`→1, `(29)`→1, `("15")`→1, `(null)`→1, `(15)`→15.
  - `planStartDaySwitch` — the four spec table rows (each asserts `current.start`, `current.end`, `nextStart`, `deleteBudgetIds`):
    - today `2026-10-28`, old 1, new 15, budgets `[oct 2026-10-01..2026-10-31]` → end `2026-11-14`, next `2026-11-15`, delete `[]`.
    - today `2026-10-10`, same → end `2026-11-14`.
    - today `2026-10-20`, old 15, new 1, `[oct 2026-10-15..2026-11-14]` → end `2026-10-31`, next `2026-11-01`.
    - today `2026-11-05`, old 15, new 1, `[oct 2026-10-15..2026-11-14, nov 2026-11-15..2026-12-14]` → end `2026-11-30`, next `2026-12-01`, delete `["nov"]`, `deleteLabels [{11,2026}]`.
    - redate: today `2026-10-28`, old 1, new 15, `[oct 10-01..10-31, dec 12-01..12-31]` → redate `[{budgetId:"dec",start:"2026-12-15",end:"2027-01-14"}]`.
    - no current row: today `2026-10-28`, old 1, new 15, `[sep 2026-09-01..2026-09-30]` → `current.budgetId null, month 10, start "2026-10-01", end "2026-11-14"`.
    - no budgets → `current: null`; same day → `null`.
- [ ] **Step 2: Run** `npx vitest run lib/budget/period.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `lib/budget/period.ts` (pure; no Dexie/network imports; date math on `{y,m,d}` integers, never `Date` UTC).
- [ ] **Step 4: Run** same command — expect PASS.
- [ ] **Step 5: Commit** — `feat(budget): pure period + switch planner`

### Task 3: Period accessors + stamp optimistic budget rows

**Files:**
- Create: `lib/budget/periodIDB.ts`, `lib/hooks/useCurrentPeriod.ts`, `lib/server/budget-period.ts`
- Modify: `lib/hooks/useBudget.ts` (`useEnsureBudgetRow` temp row), `lib/hooks/useBudgetCarry.ts` (any IDB budget literal), `lib/db/prefetch.ts` (prefetch `CURRENT_PERIOD_KEY`), plus every literal flagged by Task 1 Step 5.

**Interfaces:**
- Consumes: Task 2 exports.
- Produces:
  ```ts
  // lib/budget/periodIDB.ts (client, browser-only)
  export async function getStartDayIDB(): Promise<number>                        // profile.budget_start_day via clampStartDay
  export async function getStoredPeriodsIDB(): Promise<StoredBudgetPeriod[]>
  export async function resolvePeriodIDB(date?: Date | string | null): Promise<ResolvedPeriod>  // default now
  export async function rangeForLabelIDB(label: PeriodLabel): Promise<ResolvedPeriod>
  // lib/hooks/useCurrentPeriod.ts
  export const CURRENT_PERIOD_KEY = ["currentPeriod"] as const;
  export function useCurrentPeriod(): { period: ResolvedPeriod; startDay: number; isLoading: boolean }
  //   before load: calendar-month fallback from Task 2 with startDay 1 (never undefined)
  export function usePeriodNavigator(): { step(from: ResolvedPeriod, delta: 1|-1): Promise<ResolvedPeriod>; rangeFor(label: PeriodLabel): Promise<ResolvedPeriod> }
  // lib/server/budget-period.ts ("server-only")
  export async function getServerStartDay(supabase, userId): Promise<number>
  export async function resolveServerPeriod(supabase, userId, date?: Date | string | null): Promise<ResolvedPeriod>
  ```
  `resolveServerPeriod` reads only the user's budgets whose range could contain the date (`period_start <= date and period_end >= date`, limit 1) before falling back to computed. Accepts an ISO timestamp (uses its date in the server's timezone — documented known limitation) or a `YYYY-MM-DD` string.

- [ ] **Step 1: Test** `lib/budget/periodIDB.test.ts` with `fake-indexeddb` only if the repo already uses it (check `grep -r fake-indexeddb package.json`); otherwise skip — the logic lives in Task 2.
- [ ] **Step 2: Implement the three files.** `useCurrentPeriod` query fn = `resolvePeriodIDB()`; `staleTime: 60_000`; refetch on window focus (handles rollover while the app stays open).
- [ ] **Step 3: Stamp optimistic rows** — every `db.budgets.add/put` of a locally-minted row sets `period_start/period_end` from `rangeForLabelIDB({month, year})`. The `budgets:INSERT` sync payload stays `{ month, year }` (server trigger stamps).
- [ ] **Step 4: Prefetch** — add `qc.fetchQuery({ queryKey: CURRENT_PERIOD_KEY, queryFn: () => resolvePeriodIDB() })` in `prefetchAllQueries`.
- [ ] **Step 5: Verify** `npx tsc --noEmit` — no remaining budget-literal errors.
- [ ] **Step 6: Commit** — `feat(budget): period accessors for IDB, server, React Query`

### Task 4: SMS allocation paths

**Files:**
- Modify: `lib/server/sms-period.ts`, `lib/sms/ingestClient.ts` (`loadPeriodContextIDB`), `lib/sms/monthAllocations.ts`, `lib/hooks/useAllocatePicker.ts`, `lib/sms/nearLimit.ts` (`paceFromIDB`), `lib/sms/insightStats.ts`, `components/sms/SmsPage.tsx`, and the hook feeding `groupAllocationsForMonth` (`useMonthAllocations`).
- Test: `lib/sms/monthAllocations.test.ts`, `lib/sms/insightStats.test.ts`

**Interfaces:**
- Consumes: `resolveServerPeriod`, `resolvePeriodIDB`, `rangeForLabelIDB`, `daysElapsed/daysLeft/periodDays`.
- Changes: `groupAllocationsForMonth` input gains `range: PeriodRange`; orphan fallback tests `start <= toISODate(when) <= end` instead of `isInMonth`. `insightStats` pure fn gains a `period: ResolvedPeriod` input (replaces deriving month from `now`). `paceFromIDB` projects over the cycle: `day = daysElapsed`, `len = periodDays`, `byDay` is the cycle-day number; skip when `day < 3`.

- [ ] **Step 1: Update tests first** — monthAllocations: orphan with `occurred_at "2026-11-10T10:00:00"` lands in range `2026-10-15..2026-11-14` and not in `2026-11-15..2026-12-14`. insightStats: with period `2026-10-15..2026-11-14` and now `2026-10-20`, `daysLeft` is 25 and monthBudget reads the Oct budget. Keep all existing assertions passing at calendar ranges.
- [ ] **Step 2: Run** `npx vitest run lib/sms` — expect new tests FAIL.
- [ ] **Step 3: Implement** the call-site swaps. `sms-period.ts`/`ingestClient.ts`: look the budget up by resolved `budgetId` (fallback `[month+year]` of the resolved label). `SmsPage`: default `allocPeriod` from `useCurrentPeriod()`; its month stepper uses `usePeriodNavigator().step`; its label uses `formatPeriodLabel`.
- [ ] **Step 4: Run** `npx vitest run lib/sms` — PASS.
- [ ] **Step 5: Commit** — `feat(sms): allocate spends by budget cycle`

### Task 5: Native mirror freshness

**Files:**
- Modify: `lib/sms/nativeMirror.ts`, `lib/native/SmsReader.ts` (doc comment), `android/app/src/main/java/com/octane/allocat/SmsRules.java`, `android/app/src/main/java/com/octane/allocat/SmsTransactionReceiver.java`
- Test: `lib/sms/nativeMirror.test.ts`

**Interfaces:**
- `buildNativeSmsMirror(data, now, period: ResolvedPeriod, startDay: number)`. `curBudget` = budget with `id === period.budgetId` (fallback label match). `period` string: when `startDay === 1` and the range is a full calendar month → `"YYYY-MM"` (old APKs stay fresh); otherwise `"YYYY-MM-DD|YYYY-MM-DD"`.
- Java `SmsRules.isFresh(Context, long ts)`: stored contains `|` → fresh iff the local date of `ts` is within `[start, end]`; else legacy equality with `yyyy-MM` of `ts`. Receiver passes `ts` instead of a formatted period.

- [ ] **Step 1: Tests** — startDay 1 Oct ⇒ `period === "2026-10"`; startDay 15 ⇒ `"2026-10-15|2026-11-14"`; curItems scoped to `period.budgetId` even when `now` is in November.
- [ ] **Step 2: Run** `npx vitest run lib/sms/nativeMirror.test.ts` — FAIL, then implement TS, then PASS.
- [ ] **Step 3: Java change** — compile via Android Studio / `cd android && ./gradlew assembleDebug` (JDK 21 JBR). Expected: BUILD SUCCESSFUL.
- [ ] **Step 4: Commit** — `feat(native): cycle-aware SMS mirror freshness`

### Task 6: Dashboard, AI context, manual spend, quiz save path

**Files:**
- Modify: `lib/hooks/useDashboard.ts` (`getDashboardFromIDB`), `lib/actions/dashboard.ts`, `lib/actions/ai-chat.ts` (`getBudgetContextWith`), `lib/db/prefetch.ts` (month/year it passes), `components/dashboard/DashboardPage.tsx` (`getMonthSnapshot`), `components/dashboard/ManualSpendSheet.tsx`, `components/onboarding/quiz/QuizFlow.tsx` (`handleSave`).

**Interfaces:**
- Consumes: `resolvePeriodIDB`, `resolveServerPeriod`, `useCurrentPeriod`, `daysElapsed/daysLeft/periodDays`.
- Dashboard snapshot becomes `{ daysElapsed, daysInPeriod, daysLeft }` from `useCurrentPeriod()` (keep the SSR-null pattern). AI context names the period with `formatPeriodLabel` instead of `monthName`.
- `QuizFlow.handleSave`: label = `labelForDate(toISODate(new Date()), startDay)` where `startDay` is the quiz answer (Task 9 adds it; until then 1).

- [ ] **Step 1: Implement swaps.**
- [ ] **Step 2: Verify** `npx tsc --noEmit && npx vitest run` — all PASS.
- [ ] **Step 3: Commit** — `feat(dashboard): use budget cycle for current period`

### Task 7: Budget page, carry, reminder, reports

**Files:**
- Modify: `app/(app)/budget/page.tsx`, `components/budget/BudgetPage.tsx` (default period, prev/next, `monthOptions`, header label), `components/budget/CarryController.tsx`, `components/budget/BudgetReminderController.tsx`, `components/reports/ReportsPage.tsx` (`isPastMonth`, both txn filters, default month, month nav).

**Interfaces:**
- Consumes: `useCurrentPeriod`, `usePeriodNavigator`, `rangeForLabelIDB`, `formatPeriodLabel`.
- `page.tsx`: no `?month` → current resolved label. `?month&year` of an absorbed label (its computed range overlaps a stored budget with another label) → `router.replace` to the covering budget's label.
- `monthOptions` builds its window by `step` from the current period (12 back, 3 forward), labels via `formatPeriodLabel`.
- Carry/reminder: fire key = resolved label of today (`${year}-${month}`); the visibilitychange re-check already handles rollover — it now rolls on the start day.
- Reports: "past" = `period.end < today`; txn filters test the label's range via `rangeForLabelIDB`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** `npx tsc --noEmit && npx vitest run && pnpm lint` — PASS.
- [ ] **Step 3: Commit** — `feat(budget): cycle-aware budget page, carry, reminder, reports`

### Task 8: Start-day switch — action, sheet, entry points

**Files:**
- Create: `lib/actions/budget-cycle.ts`, `components/budget/BudgetCycleSheet.tsx`, `components/budget/BudgetCycleCard.tsx`
- Modify: `components/profile/ProfilePage.tsx` (row next to `CurrencySelector`), `components/budget/BudgetSetupSheet.tsx` (row "Budget cycle: 1st → month end · Change"), `components/dashboard/DashboardPage.tsx` (mount card)

**Interfaces:**
- Consumes: `planStartDaySwitch`, `formatPeriodLabel`, `getStoredPeriodsIDB`, `getStartDayIDB`, `CURRENT_PERIOD_KEY`, `PROFILE_KEY`, `budgetKey`, `DASHBOARD_KEY`, `forceRefreshTable` (from `SyncProvider` / `useSync`).
- Produces:
  ```ts
  // lib/actions/budget-cycle.ts ("use server")
  export async function setBudgetStartDay(day: number, today: ISODate): Promise<{ ok: true; plan: SwitchPlan | null } | { ok: false; error: string }>
  ```
  Validates `day` with `clampStartDay` (reject if it changed the value), loads the user's budgets + current start day, recomputes `planStartDaySwitch` server-side (client plan is never trusted), calls `rpc("apply_budget_cycle_switch", { p_plan })`. `today` is the client's local date (server TZ is UTC); reject if more than 1 day from server UTC date.
- Sheet: day picker 1–28; on change, compute the plan client-side from IDB for the preview using the exact copy in Global Constraints (plus the absorbed-budget warning when `deleteLabels.length`). Save calls the action; offline/error → toast, nothing changes. On success: `forceRefreshTable("profiles")`, `forceRefreshTable("budgets")`, then invalidate `CURRENT_PERIOD_KEY`, `PROFILE_KEY`, `DASHBOARD_KEY`, `["budget"]`; push native mirror (`pushSmsMirrorToNative`).
- Card: shown when `startDay === 1` and localStorage `allocat-cycle-card-dismissed` unset (try/catch); tap opens sheet; X dismisses.
- Analytics: `track("budget_cycle_changed")` — add to the `AnalyticsEvent` union; no day value.

- [ ] **Step 1: Implement action + sheet + card + entry points.**
- [ ] **Step 2: Verify** `npx tsc --noEmit && pnpm lint && npx vitest run` — PASS.
- [ ] **Step 3: Manual check** in `npm run dev`: user with Oct budget (1–31), set 15 → preview reads "Your current budget will run Oct 1 – Nov 14 (45 days)…", save, header shows "Oct 1 – Nov 14", next arrow shows "Nov 15 – Dec 14".
- [ ] **Step 4: Commit** — `feat(budget): change budget cycle start day`

### Task 9: Onboarding payday question

**Files:**
- Create: `components/onboarding/quiz/screens/Q0Payday.tsx`
- Modify: `components/onboarding/quiz/useQuizAnswers.ts` (`payday: number` default 1, actions `SET_PAYDAY`, `SKIP_PAYDAY`), `components/onboarding/quiz/QuizFlow.tsx` (slide before `reveal`; `handleSave` and `handleDiscard` call `setBudgetStartDay(answers.payday, toISODate(new Date()))` first when `payday !== 1`, best-effort like the existing calls, then `handleSave` uses `labelForDate(today, answers.payday)`).

**Interfaces:**
- Consumes: `setBudgetStartDay` (Task 8), `labelForDate`, `toISODate`.
- New users have no budgets ⇒ the plan is `current: null` (profile only); the trigger stamps the first budget with the cycle that contains today.

- [ ] **Step 1: Implement**, following an existing screen (`Q4Treat.tsx`) for layout and `deckNav` usage. Options exactly as Global Constraints; "Pick a date" reveals a 1–28 grid.
- [ ] **Step 2: Verify** `npx tsc --noEmit && pnpm lint`.
- [ ] **Step 3: Commit** — `feat(onboarding): ask payday for budget cycle`

### Task 10: End-to-end verification

- [ ] **Step 1:** `npx tsc --noEmit && pnpm lint && npx vitest run` — all green.
- [ ] **Step 2:** `npm run build` — succeeds (serwist included).
- [ ] **Step 3:** E2E drive (memory recipe: Playwright headless, sign up, dismiss tour/drawers): new user picks 15 in onboarding → budget header shows the cycle containing today; existing user flow of Task 8 Step 3; manual spend lands in the stretched budget on a date after the old month end.
- [ ] **Step 4:** Update `CLAUDE.md` Architecture with a short "Budget cycles" paragraph (start day, stored ranges win, `lib/budget/period.ts`, trigger stamps, never `getMonth()+1` for budget periods). Commit — `docs: budget cycle architecture note`
