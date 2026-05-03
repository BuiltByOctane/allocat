# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AlloCat — minimalist personal-finance PWA. Next.js 16 (App Router, Turbopack) + React 19 + Supabase + Dexie (IndexedDB) + TanStack Query 5 + Tailwind v4. Currency formatting hardcoded `en-IN` / INR in server actions and the activity logger.

`package.json` declares `name: "AlloCat-web"` despite the directory name.

## Commands

```bash
npm run dev      # next dev (Turbopack)
npm run build    # next build (PWA enabled — runs the @ducanh2912/next-pwa wrapper)
npm run start    # next start
npm run lint     # eslint (flat config in eslint.config.mjs)
```

No test runner is configured. There is no typecheck script — run `npx tsc --noEmit` if needed.

Both `package-lock.json` and `pnpm-lock.yaml` are checked in; pick the one already used in your environment to avoid drift.

## Required env (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
OPENROUTER_API_KEY=     # used by app/api/ai/chat
```

## Architecture

### Offline-first sync (the central pattern — read this before touching data flow)

Every page reads from IndexedDB first; the network is a fallback and a background reconciler. Three layers cooperate:

1. **IDB cache** — `lib/db/AllocatDB.ts` defines a Dexie schema mirroring the Supabase tables (`profiles`, `budgets`, `categories`, `budget_items`, `goals`, `assets`, `asset_categories`, `asset_value_history`, `debts`, `reports`, `net_worth_snapshots`, `activity_logs`) plus three sync infra tables: `sync_queue`, `id_map`, `sync_meta`. The DB is a browser-only singleton via `getDB()` — calling it on the server throws. Schema version bumps live in `AllocatDB.ts` constructor; add a new `.version(N).stores({...})` block, never mutate prior versions.

2. **Hydration + prefetch** — on mount, `SyncProvider` (`lib/providers/SyncProvider.tsx`) calls `hydrateAllTables()` (`lib/db/hydrate.ts`) which bulk-pulls every table for the current user into IDB. If `sync_meta.__userId__` differs from the active user, IDB is wiped first (multi-account device safety). After hydration, `prefetchAllQueries()` (`lib/db/prefetch.ts`) warms the React Query cache from IDB so first navigation has no skeletons. Use `qc.fetchQuery` (not `prefetchQuery`) when adding new prefetched keys — staleTime semantics would otherwise serve stale entries across reloads.

3. **Mutation queue** — mutations write to IDB optimistically (with a `temp_<uuid>` id for INSERTs), then `useEnqueue()` appends a `SyncQueueItem` to `sync_queue`. `SyncEngine` (`lib/sync/SyncEngine.ts`) drains the queue: each `(table, operation)` pair maps to a server action via the `dispatch` table — when adding new tables/operations, you must register a dispatcher entry there or the item will permanently fail. Failed items retry up to `MAX_RETRIES = 3` with backoff; permanent failures invoke `onRollback` (which invalidates relevant React Query keys). `temp_` ids inside payloads are rewritten to real ids via `id_map` before the action fires — use `extractTempIds` patterns when designing new payloads.

Cross-cutting rules:
- Server actions live in `lib/actions/<domain>.ts` and are the *only* path that talks to Supabase from the client side. They are also called directly during initial fetch (IDB miss) and via SyncEngine on flush.
- Read hooks live in `lib/hooks/use<Domain>.ts`. The pattern is: `getXFromIDB()` first; on miss, fall back to the server action. Each hook exports its query key constant (e.g. `DASHBOARD_KEY`, `budgetKey(month, year)`) — reuse these for invalidation.
- Mutation hooks must: (1) write to IDB optimistically, (2) `enqueue` the operation, (3) invalidate matching query keys in `onSuccess`.

### Routing

- `app/(app)/*` — protected app shell (dashboard, budget, debt, goals, net-worth, profile, activity). Layout wraps in `TourProvider` → `SyncProvider`, with mobile-first 480px frame and `md:` desktop layout.
- `app/auth/*` — login / signup / oauth callback.
- `app/onboarding/page.tsx` — post-signup flow.
- `app/api/ai/chat/route.ts` — streaming AI chat. Hard off-topic regex guard runs *before* the model call; topic detection in `lib/ai-utils.ts` decides which slice of `buildFinancialContext` to attach.

### Auth + middleware quirk

Auth uses `@supabase/ssr` with cookie-based sessions:
- `lib/supabase/server.ts` — server actions / RSCs
- `lib/supabase/client.ts` — browser
- `lib/supabase/middleware.ts` — `updateSession` refreshes tokens and gates routes

**Note**: The Next.js middleware file is named `proxy.ts` (not `middleware.ts`), exports a `proxy` function, and lives at the repo root. Do not rename it without verifying the Next 16 convention — both forms have existed across versions.

Protected paths (redirect to `/auth/login` if no user): `/dashboard`, `/budget`, `/net-worth`, `/debt`, `/onboarding`. `/goals`, `/profile`, `/activity` are *not* in this list — confirm intent before adding new private routes.

### Activity log

Server actions write to `activity_logs` via `lib/server/activity-logger.ts` (`logActivity` + `fmt` for INR formatting). Per memory: the SQL migration for the `activity_logs` table still needs to be run on Supabase if missing.

### Onboarding tour

Driver.js tour managed by `lib/tour/` — `TourContext` persists `{ enabled, seenPages }` in `localStorage` under `allocat-tour-state`. Add new pages by extending `tourSteps.ts` + `types.ts`.

### PWA

`@ducanh2912/next-pwa` wraps `next.config.ts`; service worker emitted to `public/`, disabled in dev. Manifest at `app/manifest.ts`. Install prompt UI in `components/ui/InstallPrompt.tsx`.

## Path alias

`@/*` → repo root (see `tsconfig.json`). Use it for all internal imports.

## Design system

Editorial monochrome — Inter Tight (sans), Bricolage Grotesque (display), JetBrains Mono (mono). Dark default (`#0a0a0a` bg). Material Symbols Outlined loaded from Google Fonts in the root layout. Tailwind v4 (PostCSS plugin in `postcss.config.mjs`, no `tailwind.config.*`).
