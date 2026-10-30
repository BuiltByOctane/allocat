# Split Transaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user split one pending SMS transaction, or one manual spend, across 2+ budget items. The last part is auto-calculated as the remainder, and each part becomes an ordinary allocated transaction row.

**Architecture:** A pure split module (`lib/sms/split.ts`) owns the maths, validation, dedupe keys and payload types. One new sync op, `sms_transactions:SPLIT`, carries the whole split to one new server action, `splitTransaction`, which applies each part idempotently by its deterministic dedupe key. The client hook writes the optimistic IDB state and enqueues that single op. A shared `SplitParts` view plugs into both `AllocateSheet` and `ManualSpendSheet`.

**Tech Stack:** Next.js 16, React 19, Dexie, TanStack Query 5, Supabase, vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-30-split-transaction-design.md`

## Global Constraints

- Only **pending** transactions can be split. No split in `AllocateSheet` `mode="reallocate"`.
- Minimum 2 parts. Every part has an item, no item twice, each typed amount > 0, auto remainder > 0.
- Amount maths is rounded to 2 decimals (minor units); there are never stray 0.01s.
- No merchant rule is created, changed or deleted by a split. `matched_rule_id = null` on every part.
- No part gets `original_amount` set by the split.
- SMS part 1 reuses the original row (id + dedupe_key). Part n≥2 dedupe key = `<original dedupe_key>#split:<splitId>:<n>`. Manual part n dedupe key = `manual_split:<splitId>:<n>` (n is 1-based).
- `splitId` is a client uuid fixed per "Allocate split" tap.
- One `logActivity` entry per split. action_type `sms_txn_split` (SMS) or `manual_spend_split` (manual), category `budget`. Title `Split <merchant or label> <total>`. Description `<Item> <amt>, <Item> <amt>, …`, formatted via `fmt(…, cur)`. No hardcoded ₹.
- Server: if the source row is missing or not `pending` (and not already split by this `splitId`), throw `Error("Transaction is no longer pending")`. That is a real verdict, so the normal retry → rollback path applies.
- Exactly-once level = today's `categorizeSmsTransaction` (no new migration / RPC).
- No IDB schema bump, no Supabase migration.
- Analytics: nothing extra (the `trackWrite` in `useEnqueue` covers it). Never put amounts into analytics.
- Commit subjects: short, one line (CLAUDE.md). End with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The split while the source SMS is still a `temp_` row (offline ingest).** SPLIT must wait for the INSERT, not be judged doomed, and not treat its own part temp ids as dependencies. → Task 3 test `SPLIT waits for source temp id but not its own part temp ids`.
2. **Retry after a partial server success.** Re-running the same payload must not re-apply finished parts. → Task 2 test `retry skips parts already categorized`.
3. **Totals like 1000 split as 333.33 + 333.33 → remainder 333.34.** It must not be 333.33999. → Task 1 test `remainder rounds to cents`.
4. **The user changes the header amount after typing parts (AllocateSheet).** The remainder must recompute from the new total. → Task 5 test `remainder follows total`.
5. **The rule auto-allocated the SMS before the split synced.** The server rejects it, and the client rollback re-pulls `sms_transactions` + `budget_items` so the optimistic bumps disappear. → Task 2 test `rejects non-pending source` and Task 3 test `SPLIT rollback deletes part temp rows`.

---

### Task 1: Split maths, validation, keys, payload types

**Files:**
- Create: `lib/sms/split.ts`
- Test: `lib/sms/split.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SplitPartDraft { budgetItemId: string; amount: number | null } // UI row; last row's amount ignored
  export interface SplitPartPayload { budgetItemId: string; amount: number; dedupeKey: string; tempId: string | null } // tempId null only for SMS part 1
  export interface SplitTxnPayload {
    splitId: string;
    sourceTxnId: string | null;   // null = manual split
    total: number;
    currency: string;
    label: string | null;
    merchantRaw: string | null;   // SMS only (copied from source client-side, for parts ≥2 + activity log)
    merchantNormalized: string | null;
    occurredAt: string;           // source occurred_at, or now for manual
    parts: SplitPartPayload[];
  }
  export interface SplitResult { ok: true; partIdMap: Array<{ tempId: string; realId: string; record: Record<string, unknown> }> }
  export function roundMoney(n: number): number
  export function splitRemainder(total: number, typed: number[]): number
  export type SplitIssue = "too_few_parts" | "missing_item" | "duplicate_item" | "bad_amount" | "remainder_not_positive"
  export function validateSplit(total: number, parts: SplitPartDraft[]): { ok: boolean; remainder: number; issues: SplitIssue[] }
  export function resolveSplitAmounts(total: number, parts: SplitPartDraft[]): number[] // typed amounts + remainder for last
  export function smsSplitDedupeKey(baseKey: string, splitId: string, n: number): string
  export function manualSplitDedupeKey(splitId: string, n: number): string
  ```

- [ ] **Step 1: Write failing tests** in `lib/sms/split.test.ts`:
  - `remainder rounds to cents`: `splitRemainder(1000, [333.33, 333.33])` → `333.34`; `splitRemainder(2400, [1500, 600])` → `300`.
  - `validateSplit ok`: total 2400, parts `[{a,1500},{b,600},{c,null}]` → `{ ok: true, remainder: 300, issues: [] }`.
  - `too few parts`: one part → issues contains `"too_few_parts"`.
  - `duplicate item`: `[{a,100},{a,null}]` total 300 → `"duplicate_item"`.
  - `missing item`: budgetItemId `""` → `"missing_item"`.
  - `bad amount`: a non-last part with `null`, `0` or `-5` → `"bad_amount"`.
  - `remainder_not_positive`: total 1000, `[{a,1000},{b,null}]` → remainder `0`, issue present; `[{a,1200},{b,null}]` → remainder `-200`.
  - `resolveSplitAmounts`: 2400 / `[1500, 600, null]` → `[1500, 600, 300]`.
  - keys: `smsSplitDedupeKey("abc", "s1", 2)` → `"abc#split:s1:2"`; `manualSplitDedupeKey("s1", 1)` → `"manual_split:s1:1"`.
- [ ] **Step 2: Run** `npx vitest run lib/sms/split.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `lib/sms/split.ts`. `roundMoney = Math.round(n * 100) / 100`. Only the last part's amount is ignored; every earlier part is "typed".
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(split): split maths and payload types`

---

### Task 2: Server action `splitTransaction`

**Files:**
- Modify: `lib/actions/sms.ts` (new export next to `categorizeSmsTransaction`)
- Test: `lib/actions/split-transaction.test.ts` (in-memory Supabase stub in the style of `lib/actions/reverse-spend.test.ts`; mock `@/lib/actions/budget` `quickLogSpend`, `@/lib/server/activity-logger`, `@/lib/supabase/server`)

**Interfaces:**
- Consumes: `SplitTxnPayload`, `SplitResult` from Task 1.
- Produces: `export async function splitTransaction(input: SplitTxnPayload): Promise<SplitResult>`

Behaviour, in order:
1. `getAuthed()`. Load the source row if `sourceTxnId` is set. If it is missing, or its status is not `pending`, throw `Error("Transaction is no longer pending")`. **Exception:** a source that is already `categorized` while the part-2 dedupe key row exists means this split already ran; continue as a retry.
2. For each part i (1-based):
   - **SMS part 1:** if the source is still pending, `quickLogSpend(item, amount, { kind: "sms", merchant })`, then update the source `{ status: "categorized", budget_item_id, amount, label, matched_rule_id: null }`.
   - **Others:** look up the row by `(user_id, dedupe_key)`. If it exists, skip it and push its id. Otherwise `quickLogSpend`, then insert `{ amount, currency, merchant_raw, merchant_normalized, direction: "debit", occurred_at, dedupe_key, status: "categorized", budget_item_id, label, source: sourceTxnId ? "sms" : "manual", matched_rule_id: null, original_amount: null, raw_text: null, sender: null, template_key: null }` with `.select().single()`.
   - Manual uses `quickLogSpend` without a source arg, matching how the PAYMENT path logs.
3. Call `notifyIfNearLimit(supabase, user.id, itemId, cur)` once per distinct item.
4. One `logActivity` call (see Global Constraints). Load item names with one `budget_items` select `in("id", ids)`.
5. Return `{ ok: true, partIdMap }` with an entry for every part whose `tempId` is non-null.

- [ ] **Step 1: Write failing tests:**
  - `sms split applies each part once`: pending source 2400, parts 1500/600/300 → `quickLogSpend` called 3× with those amounts; source row status `categorized` amount 1500; 2 new rows with keys `k#split:s1:2`/`:3`, source `"sms"`, `original_amount` null; `partIdMap.length === 2`.
  - `retry skips parts already categorized`: run twice with the same payload → `quickLogSpend` total calls 3, rows total 3.
  - `rejects non-pending source`: a source `categorized` with no split rows → throws `"Transaction is no longer pending"`, no `quickLogSpend` calls.
  - `manual split`: `sourceTxnId: null`, 2 parts → 2 rows with source `"manual"`, keys `manual_split:s1:1`/`:2`.
  - `one activity entry`: `logActivity` called once with `action_type: "sms_txn_split"`.
  - `never touches merchant_rules`: the stub records no `merchant_rules` access.
- [ ] **Step 2: Run** `npx vitest run lib/actions/split-transaction.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `splitTransaction` in `lib/actions/sms.ts`.
- [ ] **Step 4: Run** it again. Expected: PASS. Also run `npx vitest run lib/actions`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(split): splitTransaction server action`

---

### Task 3: Sync engine + provider wiring for SPLIT

**Files:**
- Modify: `lib/db/AllocatDB.ts:74` (add `"SPLIT"` to `SyncOperation`)
- Modify: `lib/sync/SyncEngine.ts`: `dispatch.sms_transactions.SPLIT`, the `isNestedBulkOp` / declares logic, `applySuccess`, `rollback`
- Modify: `lib/providers/SyncProvider.tsx`: `handleSynced` (~L225) and `handleRollback`
- Test: `lib/sync/SyncEngine.test.ts` (new `describe("SyncEngine SPLIT")`)

**Interfaces:**
- Consumes: `splitTransaction`, `SplitTxnPayload`, `SplitResult`.
- Produces: queue item shape `{ table: "sms_transactions", operation: "SPLIT", recordId: sourceTxnId ?? \`split_${splitId}\`, payload: SplitTxnPayload }`, with no top-level `tempId`.

Changes:
- The temp ids a SPLIT *declares* are `payload.parts[].tempId`. They must be excluded from its dependencies, just like `bulkSetupDeclares`. A `sourceTxnId` that is a `temp_` id remains a real dependency (it gets resolved via `id_map` like any other). Generalise the helper to `declaresTempId(item, tempId)` covering BULK_SETUP / CARRY_SETUP / SPLIT, and use it in both `dependencyTempIds` and `isDependencyDoomed`.
- `applySuccess`: for SPLIT, for each `partIdMap` entry, write `id_map.put` and call `replaceIDBRecord("sms_transactions", tempId, realId, record)`.
- `rollback`: for SPLIT, delete each `parts[].tempId` row from `sms_transactions`.
- `SyncProvider.handleSynced`: treat `SPLIT` like `INSERT`/`CATEGORIZE` (forced refresh of `budget_items, assets, debts`).
- `SyncProvider.handleRollback`: for `sms_transactions` (any op), `scheduleForcedRefresh(["sms_transactions","budget_items","assets","debts"], ["sms-transactions","budget","dashboard"])`. This reverts the optimistic bumps and the source row.

- [ ] **Step 1: Write failing tests:**
  - `SPLIT waits for source temp id but not its own part temp ids`: queue holds a pending INSERT with tempId `temp_src` and then a SPLIT with `sourceTxnId: "temp_src"` and parts tempIds `temp_p2`. The SPLIT is not dispatched before the INSERT. After the INSERT maps it, the SPLIT dispatches with `sourceTxnId` resolved to the real id, and `temp_p2` is NOT rewritten (it isn't in id_map).
  - `SPLIT with only own temp ids dispatches immediately` (manual case).
  - `SPLIT success maps part temp ids`: dispatcher returns a `partIdMap` → `id_map` has `temp_p2 → real2`, and the IDB row has been moved.
  - `SPLIT rollback deletes part temp rows`: a permanent failure ×3 → the `temp_p2` row is gone.
- [ ] **Step 2: Run** `npx vitest run lib/sync/SyncEngine.test.ts -t SPLIT`. Expected: FAIL.
- [ ] **Step 3: Implement** the changes listed above.
- [ ] **Step 4: Run** `npx vitest run lib/sync`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(split): sync SPLIT op`

---

### Task 4: Client hook `useSplitTransaction`

**Files:**
- Create: `lib/hooks/useSplitTransaction.ts`
- Modify: `lib/hooks/useSmsTransactions.ts`: export the near-limit notify block from `useCategorizeSms` as `notifyNearLimitForItem(itemId: string, currency: string): Promise<void>` and use it there (pure extraction, no behaviour change)
- Test: `lib/hooks/useSplitTransaction.test.ts` (Dexie-shaped stub in the style of `lib/hooks/quickSpend.test.ts`; test the exported pure-ish function below, not the React hook)

**Interfaces:**
- Consumes: Task 1 helpers/types; queue shape from Task 3.
- Produces:
  ```ts
  export interface SplitInput { sourceTxnId: string | null; total: number; label: string | null; parts: SplitPartDraft[] }
  export async function applySplit(input: SplitInput, deps: { enqueue: EnqueueFn; uuid?: () => string }): Promise<{ splitId: string }>
  export function useSplitTransaction(): UseMutationResult<{ splitId: string }, Error, SplitInput>
  ```

`applySplit`:
1. `validateSplit`, then throw `Error("Invalid split")` if it isn't ok.
2. `resolveSplitAmounts` gives the amounts. Generate `splitId`.
3. **SMS:** resolve the source via `id_map` like `resolveTxn`. Throw if it is not pending in IDB. Update the source row (`status: "categorized"`, part-1 item/amount, label, `matched_rule_id: null`). For parts ≥2, add temp rows `temp_<uuid>` copying merchant/currency/occurred_at, `source: "sms"`, `raw_text`/`sender` null, keys from `smsSplitDedupeKey`. **Manual:** every part is a temp row, `source: "manual"`, `occurred_at` now, currency from `profiles[0]`, keys from `manualSplitDedupeKey`.
4. For each part, bump the IDB budget item `actual_amount` (+ `is_completed` via `computeAutoCompletion`, `overspend_count` as in `useCategorizeSms`). Call `applyLinkedSpendCascadeIDB`, then `notifyNearLimitForItem`. Resolve item ids via `id_map` first, as `applyQuickSpend` does.
5. Make one `enqueue` call with the SPLIT shape from Task 3.

The hook wraps `applySplit` with `useEnqueue` and runs `invalidateSmsCaches(qc)` plus `ALLOCATE_PICKER_KEY` invalidation in `onSuccess`.

- [ ] **Step 1: Write failing tests:**
  - `sms split writes optimistic rows and one SPLIT`: a pending source of 2400, parts a 1500 / b 600 / c (auto) → the source row is categorized with amount 1500; 2 temp rows (600, 300) with keys `k#split:<id>:2`/`:3`; item actuals +1500/+600/+300; `enqueue` called once with `operation: "SPLIT"`, `parts[0].tempId === null`.
  - `manual split`: `sourceTxnId: null` → 2 temp rows `source: "manual"`, every `parts[].tempId` set.
  - `rejects invalid split`: a duplicate item → throws, no IDB writes, no enqueue.
  - `rejects non-pending source`: the source is categorized → throws.
- [ ] **Step 2: Run** `npx vitest run lib/hooks/useSplitTransaction.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** it.
- [ ] **Step 4: Run** `npx vitest run lib/hooks`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(split): optimistic split hook`

---

### Task 5: `SplitParts` view component

**Files:**
- Create: `components/sms/SplitParts.tsx`
- Modify: `lib/sms/split.ts` (add the reducer)
- Test: `lib/sms/split-parts-reducer.test.ts` (the repo has no DOM test tooling, so the stateful logic lives in a pure reducer and the component stays thin)

Reducer: `export function splitPartsReducer(state: SplitPartsState, action: SplitPartsAction): SplitPartsState`, where `SplitPartsState = { parts: SplitPartDraft[] }` and the actions are `{type:"add"} | {type:"remove", index} | {type:"setItem", index, itemId} | {type:"setAmount", index, amount: number | null}`, plus `initSplitParts(initialItemId?: string): SplitPartsState`. When `add` runs, the old last row's amount becomes the current remainder, so pass `total` in the `add` action: `{type:"add", total}`.

**Interfaces:**
- Consumes: `AllocateItemList`, `CategoryPickList`, `AllocatePickerItem`, `AllocateCategory` from `components/sms/AllocateSheet.tsx`; Task 1 helpers.
- Produces:
  ```ts
  interface SplitPartsProps {
    total: number;
    currency: string;
    merchant: string | null;         // header text; null for manual (show label or nothing)
    items: AllocatePickerItem[];
    categories: AllocateCategory[];
    initialItemId?: string;          // pre-fills part 1
    initialLabel?: string;
    isPending: boolean;
    onBack: () => void;
    onCreateNew?: (categoryId: string, partIndex: number) => void; // caller creates item, then calls back via setPartItem
    onSubmit: (parts: SplitPartDraft[], label: string | null) => void;
  }
  export function SplitParts(props: SplitPartsProps): JSX.Element
  ```
  Expose `partItemOverride?: { index: number; itemId: string }` so a parent's create-new flow can set a part's item once the item exists.

UI (match the existing sheet classes in `AllocateSheet.tsx`): a header with the total + merchant and a back arrow; the label "Parts"; rows of `[emoji name ▾]` with an amount input (`inputMode="decimal"`); the last row is read-only and shows the remainder with an "auto" hint; × on each row while there are more than 2; "+ Add another part"; a footer showing "Remaining" + the formatted remainder (`text-neg` when ≤0, ✓ when valid); a name input (placeholder as in AllocateSheet); the buttons **"Allocate split"** (disabled unless `validateSplit().ok` and not pending) and Cancel → `onBack`. Tapping a row's item opens an inline picker sub-view using `AllocateItemList`, which includes Create new item when `onCreateNew` is set. Items already used in other parts are left out of that picker. Starts with 2 parts. Format all money with `formatCurrency(…, { code: currency })`.

- [ ] **Step 1: Write failing reducer tests:**
  - `starts with two parts`: `initSplitParts("a").parts` → `[{a,null},{"",null}]`.
  - `add part moves auto to new last row`: total 2400, parts `[{a,1500},{b,null}]`, add → `[{a,1500},{b,900},{"",null}]`.
  - `remove is a no-op at two parts`.
  - `remainder follows total`: parts `[{a,1500},{b,null}]` → `validateSplit(2000, parts).remainder === 500`.
  - `remainder ≤ 0 is invalid`: `validateSplit(1000, [{a,1000},{b,null}]).ok === false`.
- [ ] **Step 2: Run** `npx vitest run lib/sms/split-parts-reducer.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** it.
- [ ] **Step 4: Run** it again. Expected: PASS. Also run `npx tsc --noEmit`. Expected: no new errors.
- [ ] **Step 5: Commit** `feat(split): SplitParts view`

---

### Task 6: Wire into AllocateSheet/SmsPage and ManualSpendSheet

**Files:**
- Modify: `components/sms/AllocateSheet.tsx`: `View` gains `"split"`. Add a **"Split this"** text button under the "Allocate to" title, only when `mode === "allocate"`. New optional prop `onSplit?: (parts: SplitPartDraft[], label: string | null, total: number) => void`; hide the link when it is absent. The split view renders `SplitParts` with `total = editedAmount`, `initialItemId = chosenItem`, `initialLabel = label`.
- Modify: `components/sms/SmsPage.tsx`: pass `onSplit` to the allocate-mode `AllocateSheet` only. Call `useSplitTransaction().mutateAsync({ sourceTxnId: allocateTxn.id, total, label, parts })`. On success, close the sheet. On error, `setAllocError(err.message)`, as `handleAllocate` does.
- Modify: `components/dashboard/ManualSpendSheet.tsx`: `Step` gains `"split"`. Add a "Split this" link on the `item` step. Submitting calls `useSplitTransaction` with `sourceTxnId: null, total: parsedAmount`, then `setStep("done")`. The done view for a split shows "Split across N items" instead of the single-item `SpendResult` (builder picks the exact layout). Reuse the existing `loggingRef` double-tap guard. For create-new inside the split, reuse the sheet's existing create-item path, then set the part's item via `partItemOverride`.

- [ ] **Step 1: Run** `npx tsc --noEmit` and `npm run lint`. Expected: clean.
- [ ] **Step 2: Run** `npm run test`. Expected: all pass.
- [ ] **Step 3: Manual check** (skill `run`): in the dev server, split a pending SMS row 3 ways. Check the Transactions list shows 3 rows, each budget item's actual rose by its part, the activity log has one "Split …" entry, and "Split this" is absent on Edit/Move. Check a manual split the same way.
- [ ] **Step 4: Commit** `feat(split): split option in allocate and manual sheets`

---

## Parallelism

Task 1 first. Then Tasks 2, 3, 4 and 5 can run in parallel, since all of them consume only Task 1's types plus the queue shape stated in Task 3. Task 4's test mocks enqueue, and Task 3's tests mock the dispatcher. Task 6 runs last.
