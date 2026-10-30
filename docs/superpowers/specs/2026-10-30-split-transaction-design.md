# Split a transaction across multiple budget items — design

Date: 2026-10-30

## Intent

Today one transaction goes to exactly one budget item. Real purchases don't
work that way: a ₹2,400 DMart bill can be ₹1,500 groceries, ₹600 household and
₹300 gifts. Users need to split one spend across several items, both for
**auto-captured SMS transactions** (the main case) and for **manually typed
spends**.

Once a split is saved, it stops being special. Each part is an ordinary
transaction on its own item, edited, moved or deleted with the controls that
already exist. The only lasting trace of "this was a split" is one activity-log
entry.

## Goals

- Split a **pending SMS transaction** into 2+ parts from the Allocate sheet
  (`components/sms/AllocateSheet.tsx`, "allocate" mode).
- Split a **manual spend** into 2+ parts from `components/dashboard/ManualSpendSheet.tsx`.
- The user types an amount for every part except the last; the last part is
  auto-calculated as the remainder.
- Each part becomes its own `sms_transactions` row, allocated to its own budget
  item, counting against that item exactly as a normal spend does today
  (actual_amount, linked asset/debt cascade, near-limit / overspend alerts).
- One activity-log entry records the split, e.g.
  "Split DMart ₹2,400 → Groceries ₹1,500, Household ₹600, Gifts ₹300".
- Works offline (optimistic IDB + sync queue), like every other mutation.

## Non-goals

- **No reopening / re-editing a split as a group.** After saving, parts are
  edited individually via the existing Move to / edit amount / Unallocate /
  Delete flows. (User decision.)
- **No split indicator** in the Transactions list or in a budget item's
  transaction history. Parts look like normal individual transactions. (User
  decision.)
- **No merchant rule learning for splits.** The "Remember this merchant"
  checkbox is not shown on the split screen. (User decision.)
- **Only pending transactions can be split.** No "Split this" in "reallocate"
  mode or on any already-allocated transaction, including one auto-allocated by
  a merchant rule. To split an allocated transaction the user unallocates it
  first (it goes back to pending) and then splits it. (User decision.)
- **Race (my call):** if the source row is no longer pending when the split
  reaches the server (a rule auto-allocated it on sync, or another device
  allocated it), the server rejects the split with a real, non-transient error.
  The normal `MAX_RETRIES` → `onRollback` path then invalidates the SMS caches,
  and the user sees the transaction as it actually is. Nothing is reversed
  server-side.
- No percentage / equal-split helpers. Amounts are typed.
- No change to the native Android receiver, `SmsParser.java`, or the iPhone
  Shortcut path. Splitting is a manual, in-app action on an already-ingested row.

## Anti-goals (would be a failure even if it "works")

- Parts that don't sum to the transaction total being saved.
- Double-counting: the full amount AND the parts both landing on budget items.
- A split that half-applies after a sync failure (e.g. part 1 counted, parts 2–3
  lost) with no retry.
- The original SMS being re-ingested as a fresh pending transaction after a
  split (dedupe must still hold).
- An existing merchant rule for this merchant being created, changed or deleted
  by a split.

## UX (user chose layout "B: separate split screen with parts")

Entry point: a **"Split this"** link on the item-picking step of both sheets.
It opens a split view inside the same drawer (like the existing
`pick-category` sub-view in `AllocateSheet`), with a back arrow.

Split view:

```
 ₹2,400                         DMART
 PARTS
 [🛒 Groceries ▾]          [ 1,500 ]
 [🧴 Household ▾]          [   600 ]
 [🎁 Gifts ▾]              [ 300 auto ]
 + Add another part
 ───────────────────────────────────
 Remaining                    ₹0 ✓
 [ Name this transaction (optional) ]
 ( Allocate split )        ( Cancel )
```

- Total = the sheet's amount (in AllocateSheet the user may already have edited
  it; that edited value is the total. In ManualSpendSheet it's the amount from
  the amount step).
- Starts with **2 parts**. If the user had already chosen an item before tapping
  "Split this", it pre-fills part 1.
- Each part = item picker + amount input. The item picker reuses
  `AllocateItemList` (including "Create new item" → `CategoryPickList`).
- The **last part's amount is read-only and auto-calculated** = total − sum of
  the other parts. "+ Add another part" appends a row; the new row becomes the
  auto one and the previous auto row becomes typeable, keeping its current value.
- Parts can be removed (×) while there are more than 2.
- **Valid to submit when:** ≥2 parts, every part has an item, no item used twice,
  every typed amount > 0, and the auto remainder > 0. When the typed parts reach
  or exceed the total, the remainder shows in the negative colour (`text-neg`) and
  the button is disabled.
- Name field: one optional label, applied to every part row.
- No "Remember this merchant" checkbox.
- Amount maths uses the currency's minor units (round to 2 decimals) so
  1000 / 3-style splits never leave a stray 0.01.

## Data model

Each part is a normal `sms_transactions` row with `status = "categorized"` and
its own `budget_item_id`.

**SMS split:**
- Part 1 **reuses the original row** (keeps its id and `dedupe_key`, so the
  original SMS stays deduped). Its `amount` becomes part 1's amount.
  **My call:** the split does NOT set `original_amount` on any part.
  `TransactionsPage` shows an "Originally" row whenever it is set, which would be
  a visible split marker. Part 1 keeps whatever `original_amount` it already had.
- Parts 2..N are **new rows** copying merchant_raw / merchant_normalized /
  currency / occurred_at / source ("sms") / label from the original, with
  `dedupe_key = <original dedupe_key>#split:<splitId>:<n>`. **My call:**
  `splitId` is a client-generated uuid fixed when the user taps "Allocate split".
  That keeps keys deterministic across retries of the same split, while a part
  that was unallocated and split again gets fresh keys. `raw_text` / `sender`
  are not copied.
- `matched_rule_id` is null on every part.

**Manual split:** N rows shaped like `writeManualTransaction`'s (source
"manual"). **My call:** the manual split does NOT compose today's per-part
`budget_items:PAYMENT` + `INSERT` ops (2N independent queue items could
half-apply). Both flows go through the same single split queue op and server
action (see Sync), with the manual case simply having no source row. Dedupe keys
are `manual_split:<splitId>:<n>`.

No new column and no IDB schema bump are required. **Builder's call:** add a
nullable `split_group_id` only if it is needed for idempotency. The user does
not want it surfaced in the UI.

Because parts are normal rows, the existing single-row actions
(`recategorizeSmsTransaction`, `unallocateSmsTransaction`,
`deleteSmsTransaction`) already behave correctly on them. Unallocating a part
returns just that part, at its own amount, to pending.

## Sync / server

- Must follow the offline-first contract in CLAUDE.md: optimistic IDB write
  (original row updated + temp_ rows for new parts, budget_items
  actual_amount + linked cascade per part, same as `useCategorizeSms` does for
  one item), then enqueue, then invalidate caches (`invalidateSmsCaches`).
- The server must apply the split **all-or-nothing from the user's point of
  view**: retrying a failed or partial split must converge to exactly N parts
  with each spend applied once. The deterministic `#split<n>` dedupe keys are the
  intended idempotency hook.
- Each part's spend goes through `quickLogSpend` (so cascades, overspend count
  and near-limit notify behave as today). Near-limit / overspend local
  notifications fire per affected item, as in `useCategorizeSms`.
- One `logActivity` entry for the split (action_type e.g. `sms_txn_split` /
  `manual_spend_split`, category `budget`), listing merchant, total and each
  item + amount. The per-part spend logs that `quickLogSpend` already writes may
  stay. Whether to suppress them is the builder's call.
- New queue operations need a `SyncEngine` dispatch entry (CLAUDE.md: otherwise
  the item permanently fails). Must not be added to `COLLAPSIBLE_UPDATE_TABLES`
  semantics.
- Analytics: `trackWrite` fires automatically via `useEnqueue`. No amounts in
  props.

**My call:** one new `sms_transactions:SPLIT` queue op backed by one new server
action, used by both flows. Payload: `{ splitId, sourceTxnId | null, total,
label, parts: [{ budgetItemId, amount }] }`. The action processes parts in
order. For each part it skips the work if the row with that part's dedupe key
is already categorized, and otherwise applies `quickLogSpend` and then writes the
row. It returns the real ids keyed by dedupe key so the client can reconcile its
temp_ rows (builder decides the id_map mechanics).

**Exactly-once level (my call):** match today's `categorizeSmsTransaction`. A
crash between `quickLogSpend` and the row write can, rarely, double-apply one
part on retry. No new spend-applied marker or RPC.

## Constraints

- Next 16 / React 19 / Dexie / TanStack Query patterns as in CLAUDE.md.
- Reuse `AllocateItemList` / `CategoryPickList`. Match the existing sheet styling.
- Currency formatting via `formatCurrency` / the user's currency. No hardcoded ₹.
- Budget item list = the current budget period's items (same source as today's
  pickers).
- Tests next to source (vitest): remainder maths, validation, server split
  idempotency, IDB optimistic writes.

## Left to the builder

- Exact copy, icons and placement of the "Split this" link.
- Split-view component structure (likely a shared `SplitParts` component used
  by both sheets).
- Queue-op design (see above).
- Whether per-part spend activity entries are kept alongside the split entry.
