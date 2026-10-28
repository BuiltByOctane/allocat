# Budget cycle start day ("payday budgeting") — design

Date: 2026-10-28
Status: draft, awaiting owner approval

## Why

Budgets today are calendar months (1st → month-end). Many users are paid on a
fixed day (e.g. the 15th) and plan their money from payday to payday. A budget
that resets on the 1st splits one paycheck across two budgets and makes the
"how much is left" numbers wrong for them. Each user must be able to pick the
day their budget month starts.

## Goals

- A per-user **cycle start day** (1–28). A cycle runs from that day to the day
  before the same day next month: start 15 ⇒ 15 Oct – 14 Nov, 15 Nov – 14 Dec.
  Day count per cycle does not matter.
- Existing users: back-filled to start day 1. Their behaviour and numbers are
  unchanged until they choose otherwise; they are never asked.
- New users: choose the day themselves — in onboarding, or (if they skipped
  it) before their first budget is created. No silent default of 1. Once
  chosen it is the default and is never asked again.
- Everything that today means "this month" means "this cycle": dashboard,
  budget page, SMS/iPhone/manual spend allocation, insights, near-limit alerts,
  carry-forward, new-month reminder, reports, AI chat context, native SMS mirror.
- Changing the start day mid-cycle is safe: no gaps, no overlaps, history never
  moves, and the user is told exactly what will happen before saving.

## Non-goals

- Irregular paydays ("last working day", salary arriving early) and per-cycle
  manual overrides. Not in v1. The stored per-budget dates (below) keep this
  possible later without a schema change.
- Weekly / bi-weekly cycles.
- Start days 29–31 (do not exist in every month). Max is 28.
- Storing the start day on templates. Templates stay category/item presets.

## Anti-goals (would be a failure even if it "works")

- Any existing user's past or current budget numbers changing as a result of
  the release.
- A spend landing in two budgets, or in none, because periods overlap or gap.
- Past budgets shifting their dates when the start day is changed.

## Data model

- `profiles.budget_start_day smallint` — **nullable, no default**, check
  `(budget_start_day is null or between 1 and 28)`. The migration back-fills
  every profile that exists when it runs to 1 (one-time), so existing users
  are "chosen = 1"; profiles created afterwards start null = "not chosen".
  Null is computed as 1 everywhere a range is needed (`clampStartDay`, the
  stamp trigger's `coalesce`) but is never written as 1 on the user's behalf.
  `startDayChoice` / `isStartDayChosen` / `getStartDayChoiceIDB` /
  `useCurrentPeriod().startDayChosen` expose the stored choice. The single
  source of truth for *future* cycles. Mirrored to IDB via the existing
  profile hydration.
- `budgets.period_start date`, `budgets.period_end date` (inclusive). Written
  once when a budget row is created, from the start day in effect then.
  Only ever changed again by the mid-cycle switch (below), and only on the
  budget that is current at that moment.
- Migration backfills every existing budget to `period_start = first of month`,
  `period_end = last of month`, so existing data is identical.
- `budgets (user_id, month, year)` stays the key. `(month, year)` is the cycle's
  **label = the month the cycle starts in**. Start 15 ⇒ the "October 2026"
  budget is 15 Oct – 14 Nov. Reports keep the same key.
- *(Builder call, decided)* **The server stamps** `period_start/period_end`
  on insert, from `profiles.budget_start_day` (in `ensureBudgetRow`,
  `setupBudgetFromTemplate`, carry, onboarding). The client stamps its
  optimistic IDB row with the same pure helper; the next pull reconciles any
  disagreement (server wins). Insert payloads do not carry dates, so a stale
  device cannot create an overlapping budget. No DB exclusion constraint in v1.
- New Dexie version (20) adding the new fields; no index change needed unless
  the builder wants one for date lookup.

## Period logic — one module

New `lib/budget/period.ts`, pure, unit-tested:

- `periodRange(month, year, startDay)` → `{ start, end }` (dates, inclusive).
- `periodForDate(date, startDay)` → `{ month, year }` label containing `date`.
- `daysLeft`, `daysInPeriod` helpers for the dashboard pacing / near-limit math
  (replaces the `daysInMonth` calculations).

Resolution rule everywhere: **a stored budget's `period_start/period_end` wins**
for any date it covers; the computed range from the current start day is used
only for dates no stored budget covers (i.e. future cycles not created yet).
This is what keeps history frozen and makes the stretched cycle work.

Every current `getMonth() + 1` "which month is now / is this date in" site
moves to this module. Known sites (2026-10-28):
`lib/server/sms-period.ts`, `lib/sms/ingestClient.ts`, `lib/sms/monthAllocations.ts`
(orphan fallback `isInMonth`), `lib/sms/insightStats.ts`, `lib/sms/nearLimit.ts`,
`lib/sms/nativeMirror.ts`, `lib/hooks/useAllocatePicker.ts`,
`lib/hooks/useDashboard.ts`, `lib/actions/dashboard.ts`, `lib/actions/ai-chat.ts`,
`lib/db/prefetch.ts`, `app/(app)/budget/page.tsx`, `components/budget/BudgetPage.tsx`
(navigator + month picker), `components/budget/CarryController.tsx`,
`components/budget/BudgetReminderController.tsx`, `components/sms/SmsPage.tsx`,
`components/transactions/TransactionsPage.tsx`, `components/dashboard/DashboardPage.tsx`,
`components/dashboard/ManualSpendSheet.tsx`, `components/reports/ReportsPage.tsx`,
`components/onboarding/quiz/QuizFlow.tsx`. (`lib/play/installs.ts` is unrelated.)
*(Builder call, decided)* Net-worth history (`lib/utils/netWorthHistory.ts`,
`components/net-worth/NetWorthPage.tsx`) and the activity log
(`lib/hooks/useActivityLogs.ts`) stay on calendar months — they are not budgets.

The native Java side does not compute periods; it receives the `period`
string from `nativeMirror.ts`, which must now send the cycle label.

Allocated SMS txns already belong to a cycle through their budget item, so
existing allocations need no rewrite.

## Mid-cycle switch (changing the start day)

Applies to anyone who changes the start day while a cycle is running — in
practice existing users; new users set it at onboarding. One-time effect:

1. The **current** budget's `period_end` is moved to the day before the next
   cycle under the new start day. Its `period_start` and label do not change.
2. The next cycle must start in a **later month than the current cycle's
   label** (otherwise two cycles would share a label). So:
   - next start = first occurrence of the new start day that is after today
     AND in a month later than the current label;
   - current `period_end` = that date − 1 day.
3. From then on, every cycle is a regular start-day-to-start-day cycle.
4. Past budgets are untouched. Budgets for future labels that already exist
   (user peeked ahead and set one up) are re-dated to the new rule.
   **Absorbed future budget (owner decision):** a future budget whose label is
   swallowed by the stretch (row 4 below) is **deleted** as part of the same
   atomic switch (with its categories/items; no spends can be on it since
   spends land by date in the current cycle). The preview warns first:
   "Your November plan will be removed. October now runs until 30 Nov."
5. *(Builder call, decided)* If no budget row exists yet for the current label
   (rows are created lazily by `ensureBudgetRow`), the switch **creates** it
   with the stretched dates — the atomic op is "update profile + upsert
   current budget", so dates between the last stored budget and the next
   cycle never fall into a gap.

Examples (current = October label):

| Today  | Current cycle   | New start | Result for October budget | Next cycle starts |
|--------|-----------------|-----------|---------------------------|-------------------|
| 28 Oct | 1 Oct – 31 Oct  | 15        | 1 Oct – 14 Nov (45 days)  | 15 Nov (Nov label)|
| 10 Oct | 1 Oct – 31 Oct  | 15        | 1 Oct – 14 Nov (45 days)  | 15 Nov (Nov label)|
| 20 Oct | 15 Oct – 14 Nov | 1         | 15 Oct – 31 Oct (17 days) | 1 Nov (Nov label) |
| 5 Nov  | 15 Oct – 14 Nov | 1         | 15 Oct – 30 Nov (47 days) | 1 Dec (Dec label) |

In the last row the November label is absorbed by the stretched October budget
and never gets a budget of its own. The budget navigator steps over absorbed
labels (it must never offer to create a budget whose range overlaps a stored
one).

**User is informed before saving**: the settings sheet shows a preview —
"Your current budget will run 1 Oct – 14 Nov (45 days). From then on, each
budget runs 15th → 14th." — with Save / Cancel. Nothing is written until Save.

Write path: the start-day change and the current budget's new `period_end`
are written together (both or neither). *(Builder call, decided in the plan)*
It is a direct server action — like `updateUserCurrency` and
`claimFoundingSpot` — not a queued op: the server recomputes the plan from its
own data and applies it in one RPC transaction. It needs a connection;
offline, the sheet shows an error and nothing changes. A queued switch could
replay against stale budgets on another device and delete the wrong plan.

## User flows

### New user

1. Onboarding quiz gets one new screen: **"When does your salary arrive?"** —
   *1st of the month* / *pick a date (1–28)* / *no fixed salary* (⇒ 1).
   Nothing is pre-selected. Every answer, the 1st included, is saved
   (`setBudgetStartDay`) — that is the user's explicit choice.
2. Profile saved with that day; the first budget is created for the cycle that
   contains today (e.g. signup 28 Oct, day 15 ⇒ budget 15 Oct – 14 Nov,
   "17 days left"). A user who signs up a few days before their payday gets a
   short-remaining first cycle; that is accepted.
3. The quiz save path (`QuizFlow.handleSave`) uses `labelForDate` instead of
   the calendar month.
4. **Skipped the question** ⇒ the day stays null, and the quiz does NOT create
   the budget (it would stamp a 1st-based cycle the user never chose): the
   plan is kept as a draft, exactly like "Not now". On the budget page, any
   action that would create the first budget row (Set up budget, Copy from
   last month, editing the total) first opens the cycle sheet titled "When
   does your salary arrive?"; Save stores the day and the original action
   resumes against the cycle under that day (the draft pre-fills setup).
   Auto-carry is skipped until a day is chosen; SMS / manual spends only ever
   write into an existing budget. Profile and the setup sheet show
   "Budget cycle: Not set · Set" meanwhile.

### Existing user

1. After release: start day 1 (back-filled by the migration, so "chosen"),
   budgets backfilled to calendar months — nothing visibly changes and they
   are never asked.
2. Discovery: a one-time, dismissible dashboard card: "Salary not on the 1st?
   Match your budget to payday." Opens the setting.
3. The setting is reachable from: Profile → Settings, and the budget setup /
   template sheet (shown as "Budget cycle: 1st → month end · Change").
4. Changing it runs the mid-cycle switch above, with the preview.

## UI changes

- Budget page header / month picker: label shows the range when the start day
  is not 1 ("Oct 15 – Nov 14"); plain "October 2026" when it is 1.
- Dashboard: pacing / "days left" uses the cycle length.
- Reports: a report's period is its budget's stored range.
- Carry-forward and the new-budget reminder trigger on the cycle start, not the 1st.
- Copy/visual design of the onboarding screen, settings sheet and dashboard card
  follows the existing design system; details are the builder's call.

## Analytics

`profiles` UPDATE is already tracked via `trackWrite`. Optionally a
categorical event for "start day changed" (no day value — numbers are dropped
by `sanitizeProps` anyway). Builder's call.

## Known limitation (unchanged from today)

Server-side period lookup (`sms-period.ts`, iPhone shortcut endpoint) runs in
the server's timezone, as it already does today for the calendar month. With
stored period dates, a spend within a few hours of midnight on the boundary
day may land in the adjacent cycle. Not addressed in v1.

## Left to the builder

- Exact server action / RPC shape for the atomic start-day switch.
- Dexie index choices, query-key changes, and how `budgetKey` callers obtain
  the start day.
- Test layout (pure `period.ts` tests are expected; follow existing `*.test.ts`
  next-to-source convention).
- Visual details of the new screens.
