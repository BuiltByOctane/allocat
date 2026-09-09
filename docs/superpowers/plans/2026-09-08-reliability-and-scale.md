# Reliability, Network Efficiency & Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AlloCat survive many concurrent users and flaky networks: fewer round trips per launch, batched SMS ingest, retries that never lose data, atomic counters, and a handful of security fixes — without touching the OpenRouter model choice.

**Architecture:** Three layers stay as they are (IDB cache → hydrate/prefetch → SyncEngine queue). We (1) collapse the 15-request hydrate into one RPC, (2) make the SyncEngine drain the native SMS backlog as one batched server action and refresh the UI once per drain instead of once per item, (3) stop calling Supabase Auth over the network on every request, (4) classify sync errors so outages retry forever instead of rolling back, and (5) fix the two read-modify-write counters with compare-and-swap. Security fixes are small, isolated edits.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts` middleware), React 19, Supabase (`@supabase/ssr` 0.10.2, `supabase-js` 2.49.1), Dexie, TanStack Query 5, Vitest 4 (no fake-indexeddb — tests stub `getDB()`), Capacitor Android.

**Spec:** This plan implements the findings from the 2026-09-08 architecture + security review recorded in the "Review findings" section below. There is no separate spec document.

## Global Constraints

- **The working tree already holds uncommitted admin-portal work** (`app/admin/`, `app/api/admin/`, `app/api/track/`, `lib/admin/`, `lib/config/`, `lib/play/`, `supabase/migrations/20260908000000_admin_portal.sql`, `vercel.json`, plus edits to `SyncProvider.tsx`, `middleware.ts`, `app/api/ai/chat/route.ts`, `app/(app)/layout.tsx`, …). Stage **only** the files each task lists (`git add <paths>`, never `git add -A` or `git add .`). Leave the admin files for their own commit.
- Do **not** change `OPENROUTER_MODEL` (`openrouter/free`) or the AI daily quota logic. Out of scope per product owner (no revenue yet).
- Every change must keep offline-first semantics: IDB stays the read source, mutations stay optimistic, `temp_` id mapping stays intact.
- Do not mutate existing Dexie `.version(N)` blocks in `lib/db/AllocatDB.ts`. No schema bump is required by this plan.
- SQL migrations go in `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql` and must be idempotent (`create or replace`, `if not exists`, `drop policy if exists`).
- New server code that must stay off the client imports `"server-only"`.
- Use `pnpm` for installs (npm fails with ERESOLVE). No new dependencies are needed by this plan.
- Commit messages: single concise subject line (per `CLAUDE.md`).
- Verification per task: `npx vitest run <file>`, then `npx tsc --noEmit`, then `npm run lint` before committing.
- Run `npm run test` (full suite) at the end of each phase.

---

## Review findings (the "spec")

### Reliability / scale

| # | Finding | Where | Fix task |
|---|---------|-------|----------|
| R1 | Sync badge shows pending-count spinner top-right; product wants it gone | `components/ui/SyncStatusBadge.tsx`, `app/(app)/layout.tsx:41` | Task 1 |
| R2 | Native SMS backlog drains as N separate `INSERT` queue items → N server actions × ~10 queries each, 4 at a time; each completion triggers a coalesced-but-repeated `forceRefreshTable` burst | `components/pwa/SmsBridge.tsx` `drain()`, `lib/sync/SyncEngine.ts`, `lib/providers/SyncProvider.tsx` `scheduleForcedRefresh` | Tasks 9, 10 |
| R3 | `hydrateAllTables` fires 15 parallel PostgREST requests per cold launch / stale resume | `lib/db/hydrate.ts:227-280` | Task 8 |
| R4 | `getUser()` (network call to Supabase Auth) on every matched request in middleware AND again in each of 66 server actions | `lib/supabase/middleware.ts:33`, `proxy.ts`, `lib/actions/*.ts` | Task 7 |
| R5 | SyncEngine gives up after 3 tries (2s, 4s) and **deletes the optimistic row** — a 10s outage loses data | `lib/sync/SyncEngine.ts:96,455-478` | Task 11 |
| R6 | Read-modify-write on `budget_items.actual_amount` and `debts.total_paid` loses increments under concurrent SMS ingest | `lib/actions/budget.ts:796-820`, `lib/actions/debt.ts:256-280` | Task 12 |
| R7 | RLS policies use bare `auth.uid()` (evaluated per row) | all migrations | Task 13 |
| R8 | No fetch timeout on OpenRouter, no `maxDuration` on streaming route | `lib/server/openrouter.ts`, `app/api/ai/chat/route.ts` | Task 3 |

### Security

| # | Finding | Severity | Where | Fix task |
|---|---------|----------|-------|----------|
| S1 | OAuth callback builds `${origin}${next}` from a query param without validation. `next=@evil.com` yields `https://allocat.xyz@evil.com` → open redirect to `evil.com` after login | High | `app/auth/callback/route.ts:7,36` | Task 2 |
| S2 | `lib/supabase/service.ts` (service-role key) lacks `import "server-only"` — a future accidental client import would ship the key | Medium | `lib/supabase/service.ts` | Task 2 |
| S3 | No security headers (HSTS, nosniff, frame-ancestors, referrer, permissions) | Medium | `next.config.ts` | Task 4 |
| S4 | `updateAsset` / `updateDebt` spread the client-supplied `updates` object straight into `.update()`. TS types don't exist at runtime; a crafted call can set any column on the caller's own row (`achieved_at`, `total_repayable`, `updated_at`, …). RLS blocks cross-user writes so impact is self-corruption only | Low | `lib/actions/net-worth.ts:166`, `lib/actions/debt.ts:155` | Task 5 |
| S5 | AI chat route echoes the raw OpenRouter error body to the client | Low | `app/api/ai/chat/route.ts:159` | Task 3 |
| S6 | `generateWeeklyInsight` / `generateMonthlySummary` skip both the burst limiter and the daily counter — any signed-in client can loop them | Low (cost) | `lib/actions/insights.ts`, `lib/actions/monthly-summary.ts` | Task 6 |
| S7 | Protected-route list in middleware omits `/goals`, `/profile`, `/activity`, `/sms`, `/support`, `/reports`, `/transactions`, `/notifications`. Data is still RLS-protected and reads need a session, so this only leaks the empty shell. Documented as-is in `CLAUDE.md`; **no change** (product decision) | Info | `lib/supabase/middleware.ts:38-47` | — |
| S8 | `/api/track` accepts anonymous inserts into `landing_events`. Event names are allowlisted, body capped, CORS pinned, but the per-IP limiter is in-memory per instance, so the table can be grown by a determined client. Not exploitable beyond storage cost | Low | `app/api/track/route.ts` | Ops appendix (prune cron) |

Reviewed and found OK: Ko-fi webhook (constant-time token compare, idempotent, service-role only), `deleteAccount`, AI guard layers, RLS coverage on every user table, `RECEIVE_SMS`-only manifest, SMS receiver gated by `BROADCAST_SMS`, raw SMS never leaves device, `app_config` public read, no `NEXT_PUBLIC_` secret leaks, feedback length cap, push subscription hijack blocked by RLS `with check`.

Admin portal (uncommitted, reviewed as-is): `requireAdmin()` re-run in every page, action and route handler; 404 not 403; email must be confirmed; server-only allowlist env; delete requires typed email and refuses self; cron route uses constant-time `CRON_SECRET` compare and 503s when unset; broadcast pages subscriptions and chunks sends. One scale note: `broadcast()` runs inside a single 60 s function — fine up to roughly 10k subscriptions, then it needs a queue. Not in this plan.

---

## File map

**Created**
- `lib/auth/safeNext.ts` + `lib/auth/safeNext.test.ts` — pure redirect-path validator (S1)
- `lib/utils/pick.ts` + `lib/utils/pick.test.ts` — key whitelist helper (S4)
- `lib/supabase/session.ts` — `getSessionUser()` (local JWT claims, no network) (R4)
- `lib/sync/errors.ts` + `lib/sync/errors.test.ts` — transient error classifier + backoff (R5)
- `lib/actions/concurrency.ts` — `casUpdate` retry helper for counters (R6)
- `supabase/migrations/20260909000000_hydrate_bundle.sql` — one-shot hydrate RPC (R3)
- `supabase/migrations/20260909000100_rls_select_auth_uid.sql` — policy rewrite (R7)

**Modified**
- `app/(app)/layout.tsx` — drop badge (R1)
- `app/auth/callback/route.ts` — use `safeNext` (S1)
- `lib/supabase/service.ts` — `server-only` (S2)
- `next.config.ts` — headers (S3)
- `lib/actions/net-worth.ts`, `lib/actions/debt.ts` — `pick()` (S4), CAS (R6)
- `app/api/ai/chat/route.ts`, `lib/server/openrouter.ts` — timeout, `maxDuration`, masked error (R8, S5)
- `lib/actions/insights.ts`, `lib/actions/monthly-summary.ts` — burst limit (S6)
- `proxy.ts`, `lib/supabase/middleware.ts`, `app/page.tsx`, `lib/actions/*.ts` — `getSessionUser` (R4)
- `lib/db/hydrate.ts`, `lib/types/database.ts` — RPC bundle with fallback (R3)
- `lib/db/AllocatDB.ts` — add `"BULK_INSERT"` to `SyncOperation` (R2)
- `lib/sync/SyncEngine.ts` — `onDrainComplete`, `BULK_INSERT` dispatch/apply/rollback, transient retries (R2, R5)
- `lib/providers/SyncProvider.tsx` — flush refresh on drain complete, kick queue on foreground (R2)
- `lib/actions/sms.ts` — `ingestSmsBatch` (R2)
- `lib/sms/ingestClient.ts` — `ingestSmsBatchClient` (R2)
- `components/pwa/SmsBridge.tsx` — use batch client in `drain()` (R2)
- `lib/actions/budget.ts` — CAS in `quickLogSpend` (R6)

**Deleted**
- `components/ui/SyncStatusBadge.tsx` (R1)

---

# Phase A — UI + security quick wins (low risk, ship first)

### Task 1: Remove the sync-count badge

**Files:**
- Modify: `app/(app)/layout.tsx:5,38-44`
- Delete: `components/ui/SyncStatusBadge.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. `pendingCount` stays in `SyncProvider` — `components/pwa/BadgeUpdater.tsx` still uses it for the PWA app-icon badge, and `PullToRefresh.tsx` uses `isOnline`.

- [ ] **Step 1: Remove the import and the fixed wrapper div**

In `app/(app)/layout.tsx` delete line 5:
```tsx
import { SyncStatusBadge } from "@/components/ui/SyncStatusBadge";
```
and delete the whole block (lines 37–44):
```tsx
        {/* Sync status indicator — top-right, only visible when offline or syncing */}
        <div
          className="fixed right-4 z-50"
          style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
        >
          <SyncStatusBadge />
        </div>
```

- [ ] **Step 2: Delete the component**

```bash
git rm components/ui/SyncStatusBadge.tsx
```

- [ ] **Step 3: Verify nothing else imports it**

Run: `grep -rn "SyncStatusBadge" app components lib`
Expected: no output.

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/layout.tsx
git commit -m "chore: remove sync pending-count badge"
```

---

### Task 2: OAuth open-redirect fix + lock the service client to the server

**Files:**
- Create: `lib/auth/safeNext.ts`
- Create: `lib/auth/safeNext.test.ts`
- Modify: `app/auth/callback/route.ts:7,36`
- Modify: `lib/supabase/service.ts:1`

**Interfaces:**
- Produces: `safeNextPath(raw: string | null | undefined, fallback?: string): string` — returns `raw` only if it is a same-origin absolute path (`/x`), otherwise `fallback` (`"/dashboard"`).

- [ ] **Step 1: Write the failing test**

`lib/auth/safeNext.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { safeNextPath } from "./safeNext";

describe("safeNextPath", () => {
  it("returns the fallback for empty input", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
    expect(safeNextPath(undefined)).toBe("/dashboard");
  });

  it("accepts same-origin absolute paths", () => {
    expect(safeNextPath("/onboarding")).toBe("/onboarding");
    expect(safeNextPath("/sms?txn=abc")).toBe("/sms?txn=abc");
  });

  it("rejects userinfo / host smuggling", () => {
    // `${origin}@evil.com` → https://allocat.xyz@evil.com → host evil.com
    expect(safeNextPath("@evil.com")).toBe("/dashboard");
    expect(safeNextPath("evil.com")).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
  });

  it("rejects protocol-relative and backslash paths", () => {
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
  });

  it("honours a custom fallback", () => {
    expect(safeNextPath("@x", "/")).toBe("/");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/auth/safeNext.test.ts`
Expected: FAIL — cannot resolve `./safeNext`.

- [ ] **Step 3: Implement**

`lib/auth/safeNext.ts`:
```ts
/**
 * Validate a post-login redirect target taken from a query string.
 *
 * The callback route builds `${origin}${next}`. Anything that doesn't start
 * with exactly one "/" can escape the origin: `@evil.com` becomes
 * `https://allocat.xyz@evil.com` (userinfo → host evil.com), `//evil.com` is
 * protocol-relative, and `/\evil.com` is normalised by browsers to `//`.
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth/safeNext.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Use it in the callback**

In `app/auth/callback/route.ts` add the import and replace line 7:
```ts
import { safeNextPath } from "@/lib/auth/safeNext";
// ...
  let next = safeNextPath(searchParams.get("next"));
```
Everything else in the file stays. (`next = "/onboarding"` later is a literal, still safe.)

- [ ] **Step 6: Lock the service client to the server**

`lib/supabase/service.ts` — add as the first line:
```ts
import "server-only";
```
(`server-only` is already a transitive dependency of Next; `lib/server/push-notify.ts` already imports it.)

- [ ] **Step 7: Typecheck + lint + commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add lib/auth/safeNext.ts lib/auth/safeNext.test.ts app/auth/callback/route.ts lib/supabase/service.ts
git commit -m "fix: validate oauth next param, server-only service client"
```

---

### Task 3: AI route timeouts + masked upstream error

**Files:**
- Modify: `lib/server/openrouter.ts:17-38`
- Modify: `app/api/ai/chat/route.ts` (imports at top; the `openRouterChat` call at ~line 166 and the `!openRouterRes.ok` block right after it)

**Interfaces:**
- Produces: `openRouterChat(opts)` gains optional `timeoutMs?: number` (default `45_000`).

- [ ] **Step 1: Add a timeout to the OpenRouter fetch**

In `lib/server/openrouter.ts` change the options type and the fetch call:
```ts
export function openRouterChat(opts: {
  messages: ORMessage[];
  /** SSE stream (chat) vs single JSON response (insight). Default false. */
  stream?: boolean;
  /** Ask the model to return a JSON object (insight). */
  json?: boolean;
  /** Abort the upstream request after this long. Default 45s. */
  timeoutMs?: number;
}): Promise<Response> {
  return fetch(OPENROUTER_URL, {
    method: "POST",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://allocat.xyz",
      "X-Title": "AlloCat",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      stream: opts.stream ?? false,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      messages: opts.messages,
    }),
  });
}
```

- [ ] **Step 2: Cap the route's execution time**

In `app/api/ai/chat/route.ts`, directly below the imports add:
```ts
// Streaming responses can outlive the platform's default function timeout.
export const maxDuration = 60;
```

- [ ] **Step 3: Mask the upstream error and catch the abort**

Replace the block starting at `const openRouterRes = await openRouterChat({` (~line 166) through the `if (!openRouterRes.ok || !openRouterRes.body) { … }` that follows it:
```ts
  // ── 6. Call OpenRouter ────────────────────────────────────────────────────
  let openRouterRes: Response;
  try {
    openRouterRes = await openRouterChat({
      stream: true,
      messages: [{ role: "system", content: systemPrompt }, ...windowedMessages],
    });
  } catch (err) {
    console.error("[ai/chat] upstream fetch failed:", err);
    return new Response(JSON.stringify({ error: "upstream_unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  if (!openRouterRes.ok || !openRouterRes.body) {
    console.error("[ai/chat] upstream status", openRouterRes.status, await openRouterRes.text());
    return new Response(JSON.stringify({ error: "upstream_error" }), {
      status: openRouterRes.status === 429 ? 429 : 502,
      headers: { "content-type": "application/json" },
    });
  }
```

- [ ] **Step 4: Check the client tolerates the new error codes**

Run: `grep -rn "api/ai/chat" components lib | head`
Open the fetching component and confirm it already handles a non-OK response generically (it shows a fallback message for `!res.ok`). If it switches on the `error` string, add `upstream_unavailable` / `upstream_error` to the generic branch.

- [ ] **Step 5: Typecheck + lint + commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/server/openrouter.ts app/api/ai/chat/route.ts
git commit -m "fix: ai route timeout, maxDuration, mask upstream error"
```

---

### Task 4: Security headers

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Add `headers()`**

In `next.config.ts` add inside `nextConfig` (sibling of `turbopack`):
```ts
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // The app is never framed (Capacitor loads it top-level).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
```

- [ ] **Step 2: Smoke test in dev**

Run: `npm run dev` in one terminal, then:
```bash
curl -sI http://localhost:3000/auth/login | grep -Ei "x-frame|nosniff|referrer|permissions"
```
Expected: four header lines. (HSTS is ignored over http; that's fine.)

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "security: add baseline response headers"
```

---

### Task 5: Whitelist update payloads (mass-assignment)

**Files:**
- Create: `lib/utils/pick.ts`
- Create: `lib/utils/pick.test.ts`
- Modify: `lib/actions/net-worth.ts:150-170`
- Modify: `lib/actions/debt.ts` (`updateDebt`, the `.update(updates)` call at ~155)

**Interfaces:**
- Produces: `pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K>` — copies only listed keys that are present (`!== undefined`).

- [ ] **Step 1: Write the failing test**

`lib/utils/pick.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { pick } from "./pick";

describe("pick", () => {
  it("keeps only whitelisted keys", () => {
    const input = { name: "a", value: 1, user_id: "evil", achieved_at: "x" } as Record<string, unknown>;
    expect(pick(input, ["name", "value"])).toEqual({ name: "a", value: 1 });
  });

  it("drops undefined but keeps null", () => {
    const input = { name: undefined, icon: null } as Record<string, unknown>;
    expect(pick(input, ["name", "icon"])).toEqual({ icon: null });
  });

  it("ignores prototype-injected keys", () => {
    const input = JSON.parse('{"__proto__":{"x":1},"name":"ok"}') as Record<string, unknown>;
    expect(pick(input, ["name"])).toEqual({ name: "ok" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/utils/pick.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

`lib/utils/pick.ts`:
```ts
/**
 * Copy only the listed own keys from `obj`. Server actions receive untyped JSON
 * from the client; TS parameter types are not enforced at runtime, so an
 * `updates` object must be whitelisted before it reaches `.update()`.
 */
export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) {
      out[k] = obj[k];
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test → PASS**

- [ ] **Step 5: Apply in `updateAsset`**

In `lib/actions/net-worth.ts`, import `pick` and change the start of `updateAsset` body:
```ts
import { pick } from "@/lib/utils/pick";
// ...
  const safe = pick(updates, [
    "name",
    "value",
    "icon",
    "color",
    "category_id",
    "is_goal",
    "target_amount",
  ]);

  // Toggling is_goal off clears goal-only fields
  const finalUpdates: Record<string, unknown> = {
    ...safe,
    updated_at: new Date().toISOString(),
  };
  if (safe.is_goal === false) {
    finalUpdates.target_amount = null;
    finalUpdates.achieved_at = null;
  }
```
Leave the rest of the function using `updates.*` for the activity-log text (read-only).

- [ ] **Step 6: Apply in `updateDebt`**

In `lib/actions/debt.ts`, at the top of `updateDebt` before the `needsRecalc` block:
```ts
import { pick } from "@/lib/utils/pick";
// ...
  updates = pick(updates, [
    "name",
    "type",
    "principal",
    "interest_rate",
    "monthly_minimum",
    "expected_payoff_date",
    "loan_tenure_months",
    "interest_type",
    "total_paid",
    "is_closed",
    "total_repayable",
    "color",
    "icon",
  ]);
```
Check the actual `DebtUpdate` type at the top of `debt.ts` and copy **its** key list exactly — do not add keys that aren't in the type. If `updates` is declared `const` in the signature, use a new `const safe = pick(...)` and replace subsequent `updates` references inside the function with `safe`.

- [ ] **Step 7: Typecheck + lint + commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/utils/pick.ts lib/utils/pick.test.ts lib/actions/net-worth.ts lib/actions/debt.ts
git commit -m "security: whitelist update payload keys"
```

---

### Task 6: Burst-limit the two uncounted AI actions

**Files:**
- Modify: `lib/actions/insights.ts:19-30`
- Modify: `lib/actions/monthly-summary.ts:23-34`

- [ ] **Step 1: Add limiter to `generateWeeklyInsight`**

After the `if (!user) return null;` line:
```ts
import { rateLimit } from "@/lib/server/rateLimit";
// ...
    // The client caches the result for a week; anything above a handful per
    // hour is a loop, not a user.
    if (!rateLimit(`insight:${user.id}`, 5, 60 * 60 * 1000).ok) return null;
```

- [ ] **Step 2: Same in `generateMonthlySummary`**

```ts
import { rateLimit } from "@/lib/server/rateLimit";
// ...
    if (!rateLimit(`monthly-summary:${user.id}`, 10, 60 * 60 * 1000).ok) return null;
```

- [ ] **Step 3: Typecheck + lint + commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/actions/insights.ts lib/actions/monthly-summary.ts
git commit -m "security: burst-limit insight and summary actions"
```

**Phase A checkpoint:** `npm run test` green. Deploy — all changes are independent of DB migrations.

---

# Phase B — Network efficiency

### Task 7: Stop calling Supabase Auth over the network on every request

**Files:**
- Create: `lib/supabase/session.ts`
- Modify: `lib/supabase/middleware.ts:30-35`
- Modify: `proxy.ts:8-17`
- Modify: `app/page.tsx:12-16`
- Modify: every `lib/actions/*.ts` that calls `supabase.auth.getUser()` **except** `lib/actions/auth.ts` (`deleteAccount` must stay authoritative)
- Do **not** touch `lib/admin/guard.ts` — `requireAdmin()` needs `email_confirmed_at`, which is not in the JWT claims, so it keeps `getUser()`.

**Interfaces:**
- Produces: `getSessionUser(supabase): Promise<{ id: string; email: string | null } | null>`.

**Background:** `supabase.auth.getClaims()` (available in `supabase-js` 2.49.1) verifies the access token locally against the project's JWKS when the project uses asymmetric signing keys (ES256/RS256) and only falls back to a network `getUser()` for HS256 projects. So this task is a no-op regression risk on an HS256 project and a large win once the manual step in the Ops appendix (enable JWT signing keys in the Supabase dashboard) is done.

- [ ] **Step 1: Create the helper**

`lib/supabase/session.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type SessionUser = { id: string; email: string | null };

/**
 * Resolve the signed-in user from the access token WITHOUT a network round trip.
 *
 * `getClaims()` verifies the JWT locally against the cached JWKS when the
 * project uses asymmetric signing keys; on HS256 projects it transparently
 * falls back to `getUser()`, so behaviour never regresses. Use this in
 * middleware and every server action. Keep `auth.getUser()` only where a
 * revoked-but-unexpired token must be rejected immediately (account deletion).
 */
export async function getSessionUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string" || !sub) return null;
  const email = data?.claims?.email;
  return { id: sub, email: typeof email === "string" ? email : null };
}
```

- [ ] **Step 2: Middleware — use claims and narrow the matcher**

`lib/supabase/middleware.ts` — replace the `getUser()` block:
```ts
import { getSessionUser } from "@/lib/supabase/session";
// ...
  // Refreshes the token if needed (getClaims → getSession) and verifies it
  // locally — no round trip to Supabase Auth on projects with signing keys.
  const user = await getSessionUser(supabase);
```
The two `if (!user && ...)` / `if (user && ...)` checks below keep working (they only test truthiness). The current file already lists `/admin` in `isProtectedAppRoute` — keep it.

`proxy.ts` — replace the catch-all matcher so only routes that need a session or an auth redirect pay for it. `/api/*` routes do their own auth (`requireAdmin`, `CRON_SECRET`, Ko-fi token, or none by design), `/share-target`, `/legal`, `sw.js`, `manifest.webmanifest` and the root page need nothing from middleware:
```ts
export const config = {
  matcher: [
    "/(dashboard|budget|net-worth|debt|goals|profile|activity|sms|support|reports|transactions|notifications|onboarding|auth|admin)(.*)",
  ],
};
```
Server actions POST to the page URL they were invoked from, so they still pass through the matcher when invoked from any app page.

- [ ] **Step 3: Root page**

`app/page.tsx`:
```ts
import { getSessionUser } from "@/lib/supabase/session";
// ...
export default async function RootPage() {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (user) redirect("/dashboard");
  redirect("https://grow.allocat.xyz");
}
```

- [ ] **Step 4: Server actions — mechanical replacement**

For every file in `lib/actions/` except `auth.ts`, replace each occurrence of the three-line pattern
```ts
  const { data: { user } } = await supabase.auth.getUser();
```
(and its multi-line variants
```ts
  const {
    data: { user },
  } = await supabase.auth.getUser();
```
) with
```ts
  const user = await getSessionUser(supabase);
```
and add `import { getSessionUser } from "@/lib/supabase/session";` to each file. The `if (!user) throw new Error("Unauthorized")` / `return { error: ... }` lines that follow stay unchanged. `user.id` and `user.email` keep working (`SessionUser` has both).

Special cases:
- `lib/actions/feedback.ts` and `lib/actions/push.ts` destructure `error: userErr` too — drop `userErr` and rely on `!user`.
- `lib/actions/sms.ts` and `lib/actions/push.ts` have a `getAuthed()` helper — change it there once.
- `lib/actions/ai-chat.ts` `makeCtx()` — same.
- `app/api/ai/chat/route.ts:33-39` — same replacement.

- [ ] **Step 5: Verify no stragglers**

Run: `grep -rn "auth.getUser()" lib app proxy.ts`
Expected: only `lib/actions/auth.ts` (`deleteAccount`), `lib/admin/guard.ts` (`requireAdmin`, needs `email_confirmed_at`), `lib/db/hydrate.ts` (browser client — separate concern, leave), and `app/auth/callback/route.ts` (right after code exchange, keep). `touchLastSeen` in `lib/actions/profile.ts` **is** converted like the others.

- [ ] **Step 6: Typecheck, lint, run the suite**

```bash
npx tsc --noEmit && npm run lint && npm run test
```

- [ ] **Step 7: Manual smoke (dev server)**

1. `npm run dev`, open `http://localhost:3000/dashboard` logged out → redirected to `/auth/login`.
2. Log in → `/dashboard` renders, add a budget item → saves (server action path).
3. `curl -sI http://localhost:3000/api/app-config` → 200 without touching middleware.

- [ ] **Step 8: Commit**

```bash
git add lib/supabase/session.ts lib/supabase/middleware.ts proxy.ts app/page.tsx lib/actions/*.ts app/api/ai/chat/route.ts
git commit -m "perf: verify session from local jwt claims, narrow middleware matcher"
```
(`middleware.ts`, `profile.ts`, `push.ts` and the chat route also carry uncommitted admin-portal edits; committing them here is acceptable because those edits are already in the tree and self-contained. Mention it in the commit if it bothers you: `git diff --stat` first.)

---

### Task 8: Single-RPC hydrate

**Files:**
- Create: `supabase/migrations/20260909000000_hydrate_bundle.sql`
- Modify: `lib/types/database.ts` (`Functions` block, ~line 819)
- Modify: `lib/db/hydrate.ts:203-280` (`hydrateAllTables`)

**Interfaces:**
- Produces: Postgres `public.hydrate_bundle() returns jsonb` (security invoker, RLS applies) with keys exactly matching the Dexie table names; TS `HydrateBundle` type; `fetchHydrateBundle(supabase, userId)` used by `hydrateAllTables`.

- [ ] **Step 1: Migration**

`supabase/migrations/20260909000000_hydrate_bundle.sql`:
```sql
-- One round trip for the offline-first cold hydrate. Replaces 15 parallel
-- PostgREST requests (lib/db/hydrate.ts). security INVOKER: RLS applies and
-- auth.uid() is the caller, so no cross-user read is possible. Limits mirror
-- the per-table caps hydrate.ts used before.
create or replace function public.hydrate_bundle()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(to_jsonb(p)) from profiles p
                           where p.id = (select auth.uid())), '[]'::jsonb),
    'budgets', coalesce((select jsonb_agg(to_jsonb(r)) from budgets r
                           where r.user_id = (select auth.uid())), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(r)) from categories r
                           where r.user_id = (select auth.uid())), '[]'::jsonb),
    'budget_items', coalesce((select jsonb_agg(to_jsonb(r)) from budget_items r
                           where r.user_id = (select auth.uid())), '[]'::jsonb),
    'assets', coalesce((select jsonb_agg(to_jsonb(r)) from assets r
                           where r.user_id = (select auth.uid())), '[]'::jsonb),
    'asset_categories', coalesce((select jsonb_agg(to_jsonb(r)) from asset_categories r
                           where r.user_id = (select auth.uid())), '[]'::jsonb),
    'asset_value_history', coalesce((select jsonb_agg(to_jsonb(r)) from (
                           select * from asset_value_history
                           where user_id = (select auth.uid())
                           order by entry_date desc limit 500) r), '[]'::jsonb),
    'debts', coalesce((select jsonb_agg(to_jsonb(r)) from debts r
                           where r.user_id = (select auth.uid())), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(to_jsonb(r)) from reports r
                           where r.user_id = (select auth.uid())), '[]'::jsonb),
    'net_worth_snapshots', coalesce((select jsonb_agg(to_jsonb(r)) from (
                           select * from net_worth_snapshots
                           where user_id = (select auth.uid())
                           order by snapshot_date asc limit 24) r), '[]'::jsonb),
    'activity_logs', coalesce((select jsonb_agg(to_jsonb(r)) from (
                           select * from activity_logs
                           where user_id = (select auth.uid())
                           order by created_at desc limit 200) r), '[]'::jsonb),
    'merchant_rules', coalesce((select jsonb_agg(to_jsonb(r)) from merchant_rules r
                           where r.user_id = (select auth.uid())), '[]'::jsonb),
    'sms_transactions', coalesce((select jsonb_agg(to_jsonb(r)) from (
                           select * from sms_transactions
                           where user_id = (select auth.uid())
                           order by created_at desc limit 200) r), '[]'::jsonb),
    'sms_blocklist', coalesce((select jsonb_agg(to_jsonb(r)) from sms_blocklist r
                           where r.user_id = (select auth.uid())), '[]'::jsonb),
    'feedback', coalesce((select jsonb_agg(to_jsonb(r)) from (
                           select * from feedback
                           where user_id = (select auth.uid())
                           order by created_at desc limit 100) r), '[]'::jsonb)
  );
$$;

revoke all on function public.hydrate_bundle() from public, anon;
grant execute on function public.hydrate_bundle() to authenticated;
```

- [ ] **Step 2: Type the RPC**

In `lib/types/database.ts` inside `Functions: {` add:
```ts
      hydrate_bundle: {
        Args: Record<string, never>
        Returns: Json
      }
```

- [ ] **Step 3: Refactor `hydrateAllTables` to fetch via RPC with fallback**

In `lib/db/hydrate.ts` add above `hydrateAllTables`:
```ts
type HydrateBundle = {
  profiles: Array<{ id: string }>;
  budgets: Array<{ id: string }>;
  categories: Array<{ id: string }>;
  budget_items: Array<{ id: string }>;
  assets: Array<{ id: string }>;
  asset_categories: Array<{ id: string }>;
  asset_value_history: Array<{ id: string }>;
  debts: Array<{ id: string }>;
  reports: Array<{ id: string }>;
  net_worth_snapshots: Array<{ id: string }>;
  activity_logs: Array<{ id: string }>;
  merchant_rules: Array<{ id: string }>;
  sms_transactions: Array<{ id: string }>;
  sms_blocklist: Array<{ id: string }>;
  feedback: Array<{ id: string }>;
};

const BUNDLE_KEYS = [
  "profiles", "budgets", "categories", "budget_items", "assets",
  "asset_categories", "asset_value_history", "debts", "reports",
  "net_worth_snapshots", "activity_logs", "merchant_rules",
  "sms_transactions", "sms_blocklist", "feedback",
] as const;

/** Pure: true when the RPC payload has every table key as an array. Exported for tests. */
export function isHydrateBundle(v: unknown): v is HydrateBundle {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return BUNDLE_KEYS.every((k) => Array.isArray(o[k]));
}

/**
 * One round trip (hydrate_bundle RPC). Falls back to the 15 per-table
 * requests when the function is missing (migration not yet applied) or
 * returns a malformed payload, so deploy order never breaks hydration.
 */
async function fetchHydrateBundle(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<HydrateBundle> {
  const { data, error } = await supabase.rpc("hydrate_bundle");
  if (!error && isHydrateBundle(data)) return data;
  if (error) console.warn("[hydrate] hydrate_bundle RPC failed, falling back:", error.message);
  return fetchHydrateTables(supabase, userId);
}

/** Legacy per-table pull. Kept as the fallback for fetchHydrateBundle. */
async function fetchHydrateTables(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<HydrateBundle> {
  const [
    { data: profiles }, { data: budgets }, { data: categories }, { data: budget_items },
    { data: assets }, { data: asset_categories }, { data: asset_value_history },
    { data: debts }, { data: reports }, { data: net_worth_snapshots },
    { data: activity_logs }, { data: merchant_rules }, { data: sms_transactions },
    { data: sms_blocklist }, { data: feedback },
  ] = await Promise.all([
    // … move the existing 15 queries from hydrateAllTables here, unchanged …
  ]);
  return {
    profiles: profiles ?? [], budgets: budgets ?? [], categories: categories ?? [],
    budget_items: budget_items ?? [], assets: assets ?? [], asset_categories: asset_categories ?? [],
    asset_value_history: asset_value_history ?? [], debts: debts ?? [], reports: reports ?? [],
    net_worth_snapshots: net_worth_snapshots ?? [], activity_logs: activity_logs ?? [],
    merchant_rules: merchant_rules ?? [], sms_transactions: sms_transactions ?? [],
    sms_blocklist: sms_blocklist ?? [], feedback: feedback ?? [],
  } as HydrateBundle;
}
```
Then in `hydrateAllTables` replace the `Promise.all([...15 queries])` destructure with:
```ts
  const b = await fetchHydrateBundle(supabase, userId);
  const profiles = b.profiles, budgets = b.budgets, categories = b.categories,
    budgetItems = b.budget_items, assets = b.assets, assetCategories = b.asset_categories,
    assetValueHistory = b.asset_value_history, debts = b.debts, reports = b.reports,
    snapshots = b.net_worth_snapshots, activityLogs = b.activity_logs,
    merchantRules = b.merchant_rules, smsTransactions = b.sms_transactions,
    smsBlocklist = b.sms_blocklist, feedback = b.feedback;
```
The rest of the function (`keep`, `bulkPut`, `reconcileDeletes`, `sync_meta` stamp) is unchanged. Cast the arrays at the `bulkPut` call sites with `as never` where the existing code already used `as any` for `activity_logs`; otherwise the existing types accept the rows because the RPC returns the same columns as `select("*")`.

Note on `reconcileDeletes`: it treats `null` as "fetch failed, leave locals alone" and `[]` as "server says empty". The bundle always returns arrays, and the RPC either succeeds as a whole or falls back, so an empty array is a true "no rows" — semantics preserved.

- [ ] **Step 4: Unit test the guard**

Append to `lib/db/hydrate.test.ts`:
```ts
import { isHydrateBundle } from "./hydrate";

describe("isHydrateBundle", () => {
  const full = Object.fromEntries(
    ["profiles","budgets","categories","budget_items","assets","asset_categories",
     "asset_value_history","debts","reports","net_worth_snapshots","activity_logs",
     "merchant_rules","sms_transactions","sms_blocklist","feedback"].map((k) => [k, []]),
  );
  it("accepts a complete bundle", () => expect(isHydrateBundle(full)).toBe(true));
  it("rejects a bundle missing a table", () => {
    const { feedback: _f, ...partial } = full;
    expect(isHydrateBundle(partial)).toBe(false);
  });
  it("rejects non-objects", () => {
    expect(isHydrateBundle(null)).toBe(false);
    expect(isHydrateBundle("x")).toBe(false);
  });
});
```
Run: `npx vitest run lib/db/hydrate.test.ts` → PASS.

- [ ] **Step 5: Apply the migration to Supabase and smoke test**

Run the SQL in the Supabase SQL editor (or `supabase db push` if the CLI is linked). Then in the browser: log out, log in, open DevTools → Network → filter `rpc/hydrate_bundle` → one request, status 200; no `rest/v1/budgets?...` requests during launch. Dashboard/budget/net-worth pages render with data.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add supabase/migrations/20260909000000_hydrate_bundle.sql lib/types/database.ts lib/db/hydrate.ts lib/db/hydrate.test.ts
git commit -m "perf: hydrate via single hydrate_bundle rpc with per-table fallback"
```

---

### Task 9: Refresh the UI once per drain, not once per item

**Files:**
- Modify: `lib/sync/SyncEngine.ts:145-150` (`SyncCallbacks`), `:287-330` (`processQueue`)
- Modify: `lib/providers/SyncProvider.tsx:96-130` (`scheduleForcedRefresh`), `:295-320` (visibility effect)
- Test: `lib/sync/SyncEngine.test.ts`

**Interfaces:**
- Produces: `SyncCallbacks.onDrainComplete?: () => void` fired exactly once after each drain finishes (including drains that processed zero items).

- [ ] **Step 1: Write the failing test**

Append to `lib/sync/SyncEngine.test.ts`, using the file's existing `TestEngine` subclass and `installDB()`/`seedQueue` helpers (read the top of the file for exact helper names and reuse them — do not add a second stub):
```ts
describe("onDrainComplete", () => {
  beforeEach(() => installDB());

  it("fires once per drain after all items settle", async () => {
    const engine = new TestEngine({ latencyMs: 5 });
    const drains: number[] = [];
    engine.setCallbacks({ onDrainComplete: () => drains.push(Date.now()) });
    await seedQueue([
      { table: "assets", operation: "INSERT", recordId: "temp_a", tempId: "temp_a", payload: {} },
      { table: "assets", operation: "INSERT", recordId: "temp_b", tempId: "temp_b", payload: {} },
      { table: "debts",  operation: "INSERT", recordId: "temp_c", tempId: "temp_c", payload: {} },
    ]);
    await engine.processQueue();
    expect(drains).toHaveLength(1);
    expect(await engine.getPendingCount()).toBe(0);
  });

  it("fires even when the queue is empty", async () => {
    const engine = new TestEngine({ latencyMs: 0 });
    let n = 0;
    engine.setCallbacks({ onDrainComplete: () => n++ });
    await engine.processQueue();
    expect(n).toBe(1);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`onDrainComplete` not a known callback / never called).

- [ ] **Step 3: Implement in SyncEngine**

`SyncCallbacks`:
```ts
interface SyncCallbacks {
  onPendingChange?: (count: number) => void;
  onRollback?: (item: SyncQueueItem, error: string) => void;
  onSynced?: (item: SyncQueueItem) => void | Promise<void>;
  /** Fired once after a drain pass finishes (all ready items settled). */
  onDrainComplete?: () => void;
}
```
In `processQueue`, inside the `drain` async IIFE, change the `finally`:
```ts
      } finally {
        this.isProcessing = false;
        try {
          this.callbacks.onDrainComplete?.();
        } catch (err) {
          console.warn("[SyncEngine] onDrainComplete threw:", err);
        }
      }
```

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: SyncProvider — flush on drain complete, kick on foreground**

Replace `scheduleForcedRefresh` and the flush timer in `lib/providers/SyncProvider.tsx`:
```ts
  // Accumulate tables/keys touched by synced items; flush ONCE when the engine
  // reports the drain is complete. A 30-SMS backlog used to trigger ~10
  // separate forceRefreshTable bursts (each 3 tables); now it's one.
  const forcedTablesRef = useRef<Set<RefreshTable>>(new Set());
  const refetchKeysRef = useRef<Set<string>>(new Set());

  const flushForcedRefresh = useCallback(async () => {
    const tables = [...forcedTablesRef.current];
    forcedTablesRef.current.clear();
    const keys = [...refetchKeysRef.current];
    refetchKeysRef.current.clear();
    if (tables.length > 0) {
      try {
        await Promise.all(tables.map((t) => forceRefreshTable(t)));
      } catch (err) {
        console.warn("[SyncEngine] Coalesced post-sync refresh failed:", err);
      }
    }
    for (const k of keys) qc.refetchQueries({ queryKey: [k], type: "all" });
  }, [qc]);

  const scheduleForcedRefresh = useCallback(
    (tables: RefreshTable[], keys: string[]) => {
      tables.forEach((t) => forcedTablesRef.current.add(t));
      keys.forEach((k) => refetchKeysRef.current.add(k));
    },
    []
  );
```
Delete `flushTimerRef` and the unmount-cleanup effect that cleared it.

Register the new callback where `setCallbacks` is called:
```ts
  useEffect(() => {
    engine.setCallbacks({
      onPendingChange: setPendingCount,
      onRollback: handleRollback,
      onSynced: handleSynced,
      onDrainComplete: () => void flushForcedRefresh(),
    });
    return () => engine.setCallbacks({});
  }, [engine, setPendingCount, handleRollback, handleSynced, flushForcedRefresh]);
```

In the foreground effect (`onVisible`), also wake the queue so backoff-deferred items retry immediately on resume:
```ts
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void engine.processQueue();
        void refreshFromServer();
      }
    };
```
and add `engine` to that effect's dependency array.

- [ ] **Step 6: Typecheck, lint, full engine tests, commit**

```bash
npx tsc --noEmit && npm run lint && npx vitest run lib/sync
git add lib/sync/SyncEngine.ts lib/sync/SyncEngine.test.ts lib/providers/SyncProvider.tsx
git commit -m "perf: flush post-sync refresh once per drain"
```

---

### Task 10: Batch the native SMS backlog into one server action

**Files:**
- Modify: `lib/db/AllocatDB.ts:64-77` (`SyncOperation`)
- Modify: `lib/actions/sms.ts` (`ingestSmsTransaction` → internal `ingestOne`; new `ingestSmsBatch`)
- Modify: `lib/sms/ingestClient.ts` (new `ingestSmsBatchClient`)
- Modify: `lib/sync/SyncEngine.ts` (dispatch, `isNestedBulkOp`, `bulkSetupDeclares`, `processItem`, `rollback`)
- Modify: `components/pwa/SmsBridge.tsx:107-128` (`drain`)
- Test: `lib/sms/ingestClient.test.ts`, `lib/sync/SyncEngine.test.ts`

**Interfaces:**
- Produces:
  - `SyncOperation` gains `"BULK_INSERT"`.
  - Queue item shape: `{ table: "sms_transactions", operation: "BULK_INSERT", recordId: "bulk_<uuid>", payload: { items: Array<IngestSmsInput & { tempId: string }> } }`.
  - Server: `ingestSmsBatch(items: Array<IngestSmsInput & { tempId: string }>): Promise<Array<{ tempId: string; row: SmsTransactionRow | null; error?: string }>>`, max 50 items per call.
  - Client: `ingestSmsBatchClient(messages: CapturedSms[], deps: { enqueue }, opts: { silent?: boolean }): Promise<IngestClientResult[]>`.

- [ ] **Step 1: Add the operation**

`lib/db/AllocatDB.ts`:
```ts
export type SyncOperation =
  | "INSERT"
  | "BULK_INSERT"
  | "UPDATE"
  // … rest unchanged …
```

- [ ] **Step 2: Client — failing test for batching**

Append to `lib/sms/ingestClient.test.ts` (reuse that file's `makeDB`/`installDB` stub — read its top; the stub must expose `merchant_rules`, `sms_blocklist`, `sms_transactions`, `budget_items`, `budgets`, `categories` tables and `transaction()`, which the existing tests already rely on):
```ts
import { ingestSmsBatchClient } from "./ingestClient";

describe("ingestSmsBatchClient", () => {
  const debit = (n: number) =>
    ({ sender: "AX-HDFCBK", body: `Rs ${n}.00 debited from a/c XX1234 at SWIGGY on 01-09-26`, ts: 1_700_000_000_000 + n });

  it("enqueues ONE BULK_INSERT carrying every parsed row", async () => {
    installDB();
    const enqueue = vi.fn(async () => {});
    const results = await ingestSmsBatchClient([debit(1), debit(2), debit(3)], { enqueue }, { silent: true });

    expect(results.filter((r) => r.txnId)).toHaveLength(3);
    expect(enqueue).toHaveBeenCalledTimes(1);
    const item = enqueue.mock.calls[0][0];
    expect(item.table).toBe("sms_transactions");
    expect(item.operation).toBe("BULK_INSERT");
    expect(item.recordId).toMatch(/^bulk_/);
    const items = (item.payload as { items: Array<{ tempId: string; dedupeKey: string }> }).items;
    expect(items).toHaveLength(3);
    expect(new Set(items.map((i) => i.tempId)).size).toBe(3);
    expect(items.every((i) => i.tempId.startsWith("temp_") && i.dedupeKey)).toBe(true);
  });

  it("enqueues nothing when every message is skipped", async () => {
    installDB();
    const enqueue = vi.fn(async () => {});
    await ingestSmsBatchClient(
      [{ sender: "X", body: "Your OTP is 123456", ts: 1 }],
      { enqueue },
      { silent: true },
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("splits into chunks of 50", async () => {
    installDB();
    const enqueue = vi.fn(async () => {});
    const msgs = Array.from({ length: 120 }, (_, i) => debit(i + 10));
    await ingestSmsBatchClient(msgs, { enqueue }, { silent: true });
    expect(enqueue).toHaveBeenCalledTimes(3); // 50 + 50 + 20
  });
});
```

- [ ] **Step 3: Run → FAIL** (`ingestSmsBatchClient` not exported).

- [ ] **Step 4: Client implementation**

Append to `lib/sms/ingestClient.ts`:
```ts
import type { CapturedSms } from "@/lib/native/SmsReader";

/** Max rows per BULK_INSERT queue item (server caps ingestSmsBatch at the same). */
export const SMS_BATCH_SIZE = 50;

/**
 * Ingest a backlog of SMS captured while the app was closed as ONE sync item.
 *
 * Runs the exact per-message pipeline (`ingestSmsClient`: parse, dedupe,
 * optimistic IDB row, local notifications) but intercepts the INSERT it would
 * enqueue and folds all of them into a single `BULK_INSERT` queue item, so the
 * SyncEngine makes one server-action round trip instead of N.
 */
export async function ingestSmsBatchClient(
  messages: CapturedSms[],
  deps: { enqueue: EnqueueFn },
  opts: { silent?: boolean } = {},
): Promise<IngestClientResult[]> {
  const collected: Array<Record<string, unknown>> = [];
  const collect: EnqueueFn = async (item) => {
    if (item.table === "sms_transactions" && item.operation === "INSERT") {
      collected.push({ tempId: item.tempId, ...item.payload });
      return;
    }
    await deps.enqueue(item);
  };

  const results: IngestClientResult[] = [];
  for (const m of messages) {
    results.push(
      await ingestSmsClient(
        { raw: m.body, sender: m.sender, receivedAt: m.ts },
        { enqueue: collect },
        opts,
      ),
    );
  }

  for (let i = 0; i < collected.length; i += SMS_BATCH_SIZE) {
    const chunk = collected.slice(i, i + SMS_BATCH_SIZE);
    await deps.enqueue({
      table: "sms_transactions",
      operation: "BULK_INSERT",
      recordId: `bulk_${randomUUID()}`,
      payload: { items: chunk },
    });
  }
  return results;
}
```

- [ ] **Step 5: Run → PASS**

- [ ] **Step 6: Server action**

In `lib/actions/sms.ts`:

1. Rename the body of `ingestSmsTransaction` into an internal function and keep the public wrapper:
```ts
export async function ingestSmsTransaction(input: IngestSmsInput) {
  const { supabase, user } = await getAuthed();
  return ingestOne(supabase, user, input);
}

async function ingestOne(
  supabase: Supa,
  user: { id: string; email: string | null },
  input: IngestSmsInput,
) {
  // … the existing body of ingestSmsTransaction, unchanged, from
  //   "// 1. Idempotent dedupe" to the final `return txn;` …
}
```
(The body only uses `supabase` and `user.id`, so it moves verbatim.)

2. Add the batch entry point right after:
```ts
export type IngestSmsBatchItem = IngestSmsInput & { tempId: string };
export type IngestSmsBatchResult = {
  tempId: string;
  row: Awaited<ReturnType<typeof ingestSmsTransaction>> | null;
  error?: string;
};

/** Server cap; the client chunks at the same size (SMS_BATCH_SIZE). */
const MAX_SMS_BATCH = 50;

/**
 * Ingest a backlog in one round trip. Each item runs the same authoritative
 * pipeline as ingestSmsTransaction, sequentially (so two SMS for the same
 * budget item can't race the actual_amount read-modify-write). One auth check
 * for the whole batch. Per-item failures are reported, not thrown, so a single
 * bad row can't block the other 49.
 */
export async function ingestSmsBatch(
  items: IngestSmsBatchItem[],
): Promise<IngestSmsBatchResult[]> {
  const { supabase, user } = await getAuthed();
  if (!Array.isArray(items)) return [];
  const out: IngestSmsBatchResult[] = [];
  for (const item of items.slice(0, MAX_SMS_BATCH)) {
    if (!item || typeof item.tempId !== "string" || typeof item.dedupeKey !== "string") continue;
    try {
      const { tempId: _t, ...input } = item;
      out.push({ tempId: item.tempId, row: await ingestOne(supabase, user, input) });
    } catch (err) {
      out.push({
        tempId: item.tempId,
        row: null,
        error: err instanceof Error ? err.message : "ingest failed",
      });
    }
  }
  return out;
}
```

- [ ] **Step 7: SyncEngine — failing test for BULK_INSERT apply + rollback**

Append to `lib/sync/SyncEngine.test.ts`:
```ts
describe("BULK_INSERT (sms backlog)", () => {
  beforeEach(() => installDB());

  it("maps every returned row temp→real and re-enqueues failed ones as INSERT", async () => {
    const engine = new TestEngine({
      latencyMs: 0,
      // executeItem seam: emulate ingestSmsBatch's response shape
      respond: (item) =>
        (item.payload as { items: Array<{ tempId: string }> }).items.map((i, idx) =>
          idx === 1
            ? { tempId: i.tempId, row: null, error: "boom" }
            : { tempId: i.tempId, row: { id: `real_${idx}`, status: "pending" } },
        ),
    });
    const db = getStubDB();
    for (const t of ["temp_1", "temp_2", "temp_3"]) db.sms_transactions.rows.push({ id: t, status: "pending" });
    await seedQueue([{
      table: "sms_transactions", operation: "BULK_INSERT", recordId: "bulk_x",
      payload: { items: [
        { tempId: "temp_1", dedupeKey: "k1" },
        { tempId: "temp_2", dedupeKey: "k2" },
        { tempId: "temp_3", dedupeKey: "k3" },
      ] },
    }]);

    await engine.processQueue();

    expect(db.id_map.rows.map((r) => r.tempId).sort()).toEqual(["temp_1", "temp_3"]);
    expect(db.sms_transactions.rows.map((r) => r.id).sort()).toEqual(["real_0", "real_2", "temp_2"]);
    // The failed row was re-queued as a plain INSERT so the normal retry path owns it.
    const requeued = db.sync_queue.rows.find((q) => q.operation === "INSERT" && q.tempId === "temp_2");
    expect(requeued?.status).toBe("pending");
    expect((requeued?.payload as { dedupeKey: string }).dedupeKey).toBe("k2");
  });

  it("rollback deletes every optimistic row in the batch", async () => {
    const engine = new TestEngine({ latencyMs: 0, alwaysFail: ["bulk_y"] });
    const db = getStubDB();
    db.sms_transactions.rows.push({ id: "temp_a" }, { id: "temp_b" });
    await seedQueue([{
      table: "sms_transactions", operation: "BULK_INSERT", recordId: "bulk_y",
      payload: { items: [{ tempId: "temp_a", dedupeKey: "a" }, { tempId: "temp_b", dedupeKey: "b" }] },
    }]);
    await engine.processQueue();
    // TestEngine.retryDelayMs is 0 so all 3 attempts happen inside one drain
    expect(db.sms_transactions.rows).toHaveLength(0);
  });
});
```
Adapt `TestEngine` if it lacks a `respond` option: add `respond?: (item: SyncQueueItem) => unknown` to its constructor options and return `respond(item)` from `executeItem` when provided. Adapt `getStubDB()` to whatever accessor the file already uses for the in-memory tables.

- [ ] **Step 8: Run → FAIL**

- [ ] **Step 9: SyncEngine implementation**

In `lib/sync/SyncEngine.ts`:

Imports:
```ts
import {
  ingestSmsTransaction,
  ingestSmsBatch,
  type IngestSmsBatchItem,
  type IngestSmsBatchResult,
  // … existing …
} from "@/lib/actions/sms";
```

Dispatch entry inside `sms_transactions`:
```ts
      BULK_INSERT: (p) => ingestSmsBatch(p.items as IngestSmsBatchItem[]),
```

Nested-bulk recognition:
```ts
function isNestedBulkOp(op: SyncQueueItem["operation"]): boolean {
  return op === "BULK_SETUP" || op === "CARRY_SETUP" || op === "BULK_INSERT";
}

function bulkSetupDeclares(item: SyncQueueItem, tempId: string): boolean {
  if (!isNestedBulkOp(item.operation)) return false;
  if (item.operation === "BULK_INSERT") {
    const items = (item.payload as { items?: Array<{ tempId?: string }> }).items ?? [];
    return items.some((i) => i.tempId === tempId);
  }
  // … existing BULK_SETUP / CARRY_SETUP logic unchanged …
}
```

`processItem` — add a branch after the `CARRY_SETUP` one:
```ts
      } else if (item.operation === "BULK_INSERT") {
        await this.applyBulkInsertResult(item, result as IngestSmsBatchResult[]);
      }
```

New method next to `applyCarrySetupResult`:
```ts
  /**
   * Reconcile a BULK_INSERT round trip. Rows the server accepted get the
   * normal temp→real swap. Rows that failed server-side are re-queued as
   * individual INSERTs so the regular retry/rollback path owns them — the
   * batch item itself is marked done.
   */
  private async applyBulkInsertResult(
    item: SyncQueueItem,
    results: IngestSmsBatchResult[],
  ): Promise<void> {
    const db = getDB();
    const declared = (item.payload as { items?: Array<Record<string, unknown> & { tempId: string }> }).items ?? [];
    const byTemp = new Map(declared.map((d) => [d.tempId, d]));
    const seen = new Set<string>();

    for (const r of results ?? []) {
      seen.add(r.tempId);
      const realId = (r.row as { id?: string } | null)?.id;
      if (r.row && realId && realId !== r.tempId) {
        await db.id_map.put({ tempId: r.tempId, realId, table: "sms_transactions" });
        await this.replaceIDBRecord(
          "sms_transactions",
          r.tempId,
          realId,
          r.row as Record<string, unknown>,
        );
        continue;
      }
      await this.requeueSingleInsert(byTemp.get(r.tempId));
    }
    // Anything the server didn't answer for (truncated batch) also retries alone.
    for (const d of declared) if (!seen.has(d.tempId)) await this.requeueSingleInsert(d);
  }

  private async requeueSingleInsert(
    declared: (Record<string, unknown> & { tempId: string }) | undefined,
  ): Promise<void> {
    if (!declared) return;
    const { tempId, ...payload } = declared;
    const db = getDB();
    await db.sync_queue.add({
      table: "sms_transactions",
      operation: "INSERT",
      recordId: tempId,
      tempId,
      payload,
      retries: 0,
      status: "pending",
      createdAt: Date.now(),
    });
  }
```

`rollback` — extend the nested-bulk branch:
```ts
    if (isNestedBulkOp(item.operation)) {
      if (item.operation === "BULK_INSERT") {
        const items = (item.payload as { items?: Array<{ tempId: string }> }).items ?? [];
        for (const i of items) await db.sms_transactions.delete(i.tempId);
        return;
      }
      // … existing BULK_SETUP / CARRY_SETUP rollback unchanged …
    }
```

- [ ] **Step 10: Run → PASS**, then `npx vitest run lib/sync lib/sms`.

- [ ] **Step 11: Wire the bridge**

In `components/pwa/SmsBridge.tsx` import `ingestSmsBatchClient` and replace the loop inside `drain`:
```ts
import { ingestSmsClient, ingestSmsBatchClient, reapplyRulesToPending } from "@/lib/sms/ingestClient";
// …
        const { messages } = await SmsReader.getQueued();
        if (messages.length > 0) {
          await ingestSmsBatchClient(messages, { enqueue: enqueueRef.current }, { silent: true });
        }
```
The live-event `handle(m, false)` path keeps using `ingestSmsClient` (single INSERT).

- [ ] **Step 12: Hydrate protection sanity**

`buildProtectedIds()` in `lib/db/hydrate.ts` keys on `item.recordId`; a `bulk_…` id never matches a server row, and the nested `temp_` rows are never in the server payload, so protection semantics hold without changes. Confirm by reading `filterProtected` — no edit needed.

- [ ] **Step 13: Typecheck, lint, test, commit**

```bash
npx tsc --noEmit && npm run lint && npm run test
git add lib/db/AllocatDB.ts lib/actions/sms.ts lib/sms/ingestClient.ts lib/sms/ingestClient.test.ts lib/sync/SyncEngine.ts lib/sync/SyncEngine.test.ts components/pwa/SmsBridge.tsx
git commit -m "perf: batch native sms backlog into one BULK_INSERT sync item"
```

- [ ] **Step 14: Device smoke (Android)**

Build via Android Studio, install, grant SMS, kill the app, send 3 test transaction SMS, reopen. DevTools (chrome://inspect) → Network: exactly one server-action POST for ingestion; `/sms` lists the three rows; budget totals updated.

**Phase B checkpoint:** `npm run test` green; deploy web first, then Android build. Run the Ops appendix step "JWT signing keys".

---

# Phase C — Correctness under outage and concurrency

### Task 11: Never lose data on a transient failure

**Files:**
- Create: `lib/sync/errors.ts`
- Create: `lib/sync/errors.test.ts`
- Modify: `lib/sync/SyncEngine.ts:455-478` (`processItem` catch), `:483-485` (`retryDelayMs`)
- Test: `lib/sync/SyncEngine.test.ts`

**Interfaces:**
- Produces: `isTransientSyncError(err: unknown, online?: boolean): boolean`, `transientBackoffMs(retries: number): number` (2^n seconds, capped at 5 min).

- [ ] **Step 1: Failing tests for the classifier**

`lib/sync/errors.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isTransientSyncError, transientBackoffMs } from "./errors";

describe("isTransientSyncError", () => {
  it("treats offline as transient regardless of error", () => {
    expect(isTransientSyncError(new Error("Unauthorized"), false)).toBe(true);
  });
  it("treats fetch/network failures as transient", () => {
    expect(isTransientSyncError(new TypeError("Failed to fetch"), true)).toBe(true);
    expect(isTransientSyncError(new Error("fetch failed"), true)).toBe(true);
    expect(isTransientSyncError(new Error("Load failed"), true)).toBe(true);
    expect(isTransientSyncError(new Error("An unexpected response was received from the server."), true)).toBe(true);
    expect(isTransientSyncError(new Error("Request timed out"), true)).toBe(true);
    expect(isTransientSyncError(new Error("503 Service Unavailable"), true)).toBe(true);
  });
  it("treats validation / auth errors as permanent", () => {
    expect(isTransientSyncError(new Error("Items exceed the category budget of ₹500 by ₹50."), true)).toBe(false);
    expect(isTransientSyncError(new Error("Unauthorized"), true)).toBe(false);
    expect(isTransientSyncError(new Error("Item not found"), true)).toBe(false);
    expect(isTransientSyncError("dependency never synced", true)).toBe(false);
  });
});

describe("transientBackoffMs", () => {
  it("doubles then caps at 5 minutes", () => {
    expect(transientBackoffMs(1)).toBe(2_000);
    expect(transientBackoffMs(3)).toBe(8_000);
    expect(transientBackoffMs(20)).toBe(300_000);
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement**

`lib/sync/errors.ts`:
```ts
/**
 * Classify a failed server-action round trip.
 *
 * Transient = the request never got a verdict (offline, DNS/TLS failure, the
 * platform returned 5xx/HTML, a timeout). These must retry until they succeed;
 * dropping them loses user data. Everything else (validation, auth, "not
 * found") is a real answer and follows the bounded retry → rollback path.
 *
 * Next.js masks server-thrown error messages in production, so a masked
 * error looks permanent here — correct: the server *did* answer.
 */
const TRANSIENT_RE =
  /failed to fetch|fetch failed|load failed|network ?(error|request failed)|unexpected response was received|timed? ?out|timeout|\b50[234]\b|ECONN(RESET|REFUSED)|socket hang up|aborted/i;

export function isTransientSyncError(
  err: unknown,
  online: boolean = typeof navigator === "undefined" ? true : navigator.onLine,
): boolean {
  if (!online) return true;
  if (err instanceof TypeError) return true; // fetch() rejects with TypeError on network failure
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return TRANSIENT_RE.test(msg);
}

export const TRANSIENT_MAX_BACKOFF_MS = 5 * 60 * 1000;

export function transientBackoffMs(retries: number): number {
  return Math.min(Math.pow(2, retries) * 1000, TRANSIENT_MAX_BACKOFF_MS);
}
```

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Failing engine test**

Append to `lib/sync/SyncEngine.test.ts`:
```ts
describe("transient failures never roll back", () => {
  beforeEach(() => installDB());

  it("keeps retrying past MAX_RETRIES when the error is a network failure", async () => {
    const engine = new TestEngine({
      latencyMs: 0,
      // executeItem seam: throw a fetch-style TypeError every time
      throwFor: { temp_n: () => new TypeError("Failed to fetch") },
    });
    const db = getStubDB();
    db.assets.rows.push({ id: "temp_n" });
    await seedQueue([{ table: "assets", operation: "INSERT", recordId: "temp_n", tempId: "temp_n", payload: {} }]);

    await engine.processQueue(); // drains with retryDelayMs=0 → would exhaust 3 tries if bounded
    const q = db.sync_queue.rows[0];
    expect(q.status).toBe("pending");
    expect(q.retries).toBeGreaterThanOrEqual(3);
    expect(db.assets.rows.map((r) => r.id)).toEqual(["temp_n"]); // optimistic row survives
  });
});
```
Adapt `TestEngine` to accept `throwFor?: Record<string, () => Error>` in addition to its existing `alwaysFail` list; in `executeItem`, if `throwFor[item.recordId]` exists, throw its result. Note: because transient retries are unbounded, `TestEngine.retryDelayMs()` returning `0` would loop forever inside one drain — so in this test make the seam count calls and, after the 5th call, flip `navigator.onLine`-equivalent by making the seam succeed (return `{ id: "real_n" }`). Assert `retries >= 3` **and** that the row was eventually mapped: `expect(db.id_map.rows[0]?.realId).toBe("real_n")`.

- [ ] **Step 6: Run → FAIL** (currently fails permanently after 3 and deletes the row).

- [ ] **Step 7: Implement in `processItem`**

```ts
import { isTransientSyncError, transientBackoffMs } from "@/lib/sync/errors";
// …
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Sync failed";
      const nextRetries = item.retries + 1;

      if (isTransientSyncError(err)) {
        // No verdict from the server — keep the optimistic row, retry with a
        // capped backoff forever. Data is never dropped because the network blinked.
        await db.sync_queue.update(item.id, {
          status: "pending",
          retries: nextRetries,
          lastError: errMsg,
          nextAttemptAt: Date.now() + this.transientDelayMs(nextRetries),
        });
        await this.notifyPendingChange();
        return;
      }

      if (nextRetries >= MAX_RETRIES) {
        // … existing permanent-failure path unchanged …
      } else {
        // … existing bounded retry path unchanged …
      }
    }
```
Add next to `retryDelayMs`:
```ts
  /** Backoff for transient (network) failures. Overridable in tests. */
  protected transientDelayMs(retries: number): number {
    return transientBackoffMs(retries);
  }
```
In `TestEngine` override `transientDelayMs()` to return `0` as well.

- [ ] **Step 8: Run → PASS**, then `npx vitest run lib/sync`.

- [ ] **Step 9: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/sync/errors.ts lib/sync/errors.test.ts lib/sync/SyncEngine.ts lib/sync/SyncEngine.test.ts
git commit -m "fix: retry transient sync failures indefinitely instead of rolling back"
```

---

### Task 12: Compare-and-swap for the two counters

**Files:**
- Create: `lib/actions/concurrency.ts`
- Modify: `lib/actions/budget.ts:796-830` (`quickLogSpend`)
- Modify: `lib/actions/debt.ts:251-281` (`makePayment`)

**Interfaces:**
- Produces: `withCas<T>(attempts: number, fn: () => Promise<T | null>): Promise<T>` — calls `fn` until it returns non-null; throws `Error("Concurrent update, please retry")` after `attempts` nulls.

- [ ] **Step 1: Helper**

`lib/actions/concurrency.ts`:
```ts
import "server-only";

/**
 * Optimistic-concurrency loop for read-modify-write counters. `fn` reads the
 * current row, computes the new value and issues an UPDATE filtered on the
 * value it read (`.eq("actual_amount", previous)`). PostgREST returns no row
 * when another writer got there first — return `null` and we re-read.
 */
export async function withCas<T>(
  attempts: number,
  fn: () => Promise<T | null>,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    const out = await fn();
    if (out !== null) return out;
  }
  throw new Error("Concurrent update, please retry");
}
```

- [ ] **Step 2: `quickLogSpend`**

Replace the section from `const [{ data: item }, cur] = await Promise.all([...])` through the `if (error) throw new Error(error.message);` after the update with:
```ts
import { withCas } from "@/lib/actions/concurrency";
// …
  const cur = await getUserCurrency(supabase, user.id);

  // Compare-and-swap on actual_amount: two SMS ingests for the same item can
  // run concurrently (SyncEngine drains 4 at a time); a plain read→write would
  // drop one increment. The update is filtered on the value we read, so a lost
  // race yields no row and we re-read.
  const { item, updatedItem } = await withCas(4, async () => {
    const { data: item } = await supabase
      .from("budget_items")
      .select("*")
      .eq("id", itemId)
      .eq("user_id", user.id)
      .single();
    if (!item) throw new Error("Item not found");

    const previousActual = Number(item.actual_amount);
    const newActual = previousActual + Number(amount);
    const planned = Number(item.planned_amount);
    const previousOverspendCount = Number(item.overspend_count ?? 0);
    const isOver = planned > 0 && newActual > planned;
    const nextOverspendCount = isOver ? previousOverspendCount + 1 : previousOverspendCount;
    const nextCompleted = computeAutoCompletion(planned, newActual);

    const { data: updatedItem, error } = await supabase
      .from("budget_items")
      .update({ actual_amount: newActual, is_completed: nextCompleted, overspend_count: nextOverspendCount })
      .eq("id", itemId)
      .eq("user_id", user.id)
      .eq("actual_amount", item.actual_amount)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updatedItem) return null; // lost the race — re-read
    return { item, updatedItem };
  });

  const previousActual = Number(item.actual_amount);
  const previousCompleted = Boolean(item.is_completed);
  const previousOverspendCount = Number(item.overspend_count ?? 0);
  const newActual = Number(updatedItem.actual_amount);
  const planned = Number(item.planned_amount);
  const isOver = planned > 0 && newActual > planned;
  const nextOverspendCount = Number(updatedItem.overspend_count ?? 0);
```
The remainder of the function (cascade, revert on cascade failure, logging, push) already uses `previousActual`, `previousCompleted`, `previousOverspendCount`, `newActual`, `planned`, `isOver`, `nextOverspendCount`, `updatedItem`, `item`, `cur` — confirm each is still defined after the edit with `npx tsc --noEmit`.

- [ ] **Step 3: `makePayment`**

Replace the read + update with:
```ts
import { withCas } from "@/lib/actions/concurrency";
// …
  const { debt, data } = await withCas(4, async () => {
    const { data: debt } = await supabase
      .from("debts")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (!debt) throw new Error("Debt not found");

    const newTotalPaid = Number(debt.total_paid) + Number(amount);
    const repayableTarget = Number(debt.total_repayable) > 0
      ? Number(debt.total_repayable)
      : Number(debt.principal);
    const isClosed = newTotalPaid >= repayableTarget;

    const { data, error } = await supabase
      .from("debts")
      .update({ total_paid: newTotalPaid, is_closed: isClosed || debt.is_closed })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("total_paid", debt.total_paid)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return { debt, data };
  });
```
Keep the code after it (activity log, return) using `debt`/`data` as before; re-derive any locals it needs (`newTotalPaid`, `isClosed`) from `data`.

- [ ] **Step 4: Existing tests**

Run: `npx vitest run lib/actions/reverse-spend.test.ts` — must still pass (it exercises the reverse path; if it mocks `budget_items.update` chains, extend the mock chain with `.eq()` ×3 and `.maybeSingle()`).

- [ ] **Step 5: Manual concurrency check (dev)**

In the browser console on `/budget`, fire two quick-spends on the same item back-to-back without awaiting: both must land (`actual_amount` increases by the sum, not by the last one).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/actions/concurrency.ts lib/actions/budget.ts lib/actions/debt.ts
git commit -m "fix: compare-and-swap for budget item and debt counters"
```

---

### Task 13: RLS policies with `(select auth.uid())`

**Files:**
- Create: `supabase/migrations/20260909000100_rls_select_auth_uid.sql`

- [ ] **Step 1: Migration**

```sql
-- Wrap auth.uid() in a scalar subquery so Postgres evaluates it once per
-- statement (InitPlan) instead of once per row. Same policy semantics,
-- materially faster on the large per-user tables.
-- Ref: Supabase "RLS performance" guide.

-- profiles is keyed by id, not user_id.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check ((select auth.uid()) = id);

do $$
declare
  t text;
  full_crud text[] := array[
    'budgets','categories','budget_items','asset_categories','assets',
    'asset_value_history','debts','reports','net_worth_snapshots',
    'activity_logs','push_subscriptions','merchant_rules','sms_transactions',
    'sms_blocklist','budget_templates'
  ];
begin
  foreach t in array full_crud loop
    execute format('drop policy if exists "%s_select_own" on public.%I', t, t);
    execute format('create policy "%s_select_own" on public.%I for select using ((select auth.uid()) = user_id)', t, t);
    execute format('drop policy if exists "%s_insert_own" on public.%I', t, t);
    execute format('create policy "%s_insert_own" on public.%I for insert with check ((select auth.uid()) = user_id)', t, t);
    execute format('drop policy if exists "%s_update_own" on public.%I', t, t);
    execute format('create policy "%s_update_own" on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t, t);
    execute format('drop policy if exists "%s_delete_own" on public.%I', t, t);
    execute format('create policy "%s_delete_own" on public.%I for delete using ((select auth.uid()) = user_id)', t, t);
  end loop;
end $$;

-- feedback deliberately has no UPDATE policy (users can't edit sent feedback).
drop policy if exists "feedback_select_own" on public.feedback;
create policy "feedback_select_own" on public.feedback
  for select using ((select auth.uid()) = user_id);
drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own" on public.feedback
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "feedback_delete_own" on public.feedback;
create policy "feedback_delete_own" on public.feedback
  for delete using ((select auth.uid()) = user_id);
```

- [ ] **Step 2: Cross-check table list**

Run: `grep -n "create policy" supabase/migrations/*.sql docs/migrations/*.sql | grep -v 20260909000100`
Every `*_own` policy name in the output must be covered by the migration above (`merchant_rules`, `sms_transactions`, `sms_blocklist`, `budget_templates`, `feedback` are included; `app_config public read` is anon-readable by design and stays). If a table appears that isn't listed, add it to `full_crud`.

- [ ] **Step 3: Apply in Supabase SQL editor, then verify**

```sql
select tablename, policyname, qual from pg_policies
where schemaname = 'public' and qual like '%auth.uid()%' and qual not like '%( SELECT auth.uid()%';
```
Expected: zero rows (except `app_config`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260909000100_rls_select_auth_uid.sql
git commit -m "perf: rls policies use (select auth.uid())"
```

**Phase C checkpoint:** `npm run test` green; `npx tsc --noEmit` clean; deploy.

---

## Ops appendix (manual, outside the codebase)

1. **JWT signing keys (unlocks Task 7 fully).** Supabase dashboard → Project Settings → JWT Keys → "Migrate to signing keys" → create an ECC (P-256) key and rotate. After rotation, `getClaims()` verifies locally; `/auth/v1/user` traffic from the server drops to near zero. Verify in Supabase → Logs → Auth: request count on `/user` falls after deploy.
2. **Apply migrations** in order: `20260909000000_hydrate_bundle.sql`, `20260909000100_rls_select_auth_uid.sql`. Both are idempotent.
3. **Prune growth tables** (optional now, needed before ~10k users). If `pg_cron` is enabled on the project:
   ```sql
   select cron.schedule('prune-ai-usage', '15 3 * * *',
     $$delete from public.ai_usage where day < (now() at time zone 'utc')::date - 7$$);
   select cron.schedule('prune-activity-logs', '30 3 * * *',
     $$delete from public.activity_logs where created_at < now() - interval '180 days'$$);
   select cron.schedule('prune-landing-events', '45 3 * * *',
     $$delete from public.landing_events where created_at < now() - interval '90 days'$$);
   ```
4. **Vercel function region** should match the Supabase project region (every server action does 2–10 DB round trips; cross-region adds ~100 ms each).

## Self-review

- **Spec coverage:** R1→T1, R2→T9+T10, R3→T8, R4→T7, R5→T11, R6→T12, R7→T13, R8→T3; S1,S2→T2, S3→T4, S4→T5, S5→T3, S6→T6, S7 documented no-change. OpenRouter model untouched per constraint.
- **Placeholders:** the only elided block is "move the existing 15 queries" in Task 8 Step 3 — those queries exist verbatim at `lib/db/hydrate.ts:227-280` and the executor is told to move them unchanged.
- **Type consistency:** `getSessionUser` returns `{ id, email }` and every replaced call site uses only `user.id` / `user.email`; `IngestSmsBatchItem` / `IngestSmsBatchResult` names match between `sms.ts`, `SyncEngine.ts`, and the tests; `onDrainComplete` is the name in both `SyncCallbacks` and `SyncProvider`; `withCas` signature matches both call sites; `SMS_BATCH_SIZE` (client) equals `MAX_SMS_BATCH` (server) at 50.
