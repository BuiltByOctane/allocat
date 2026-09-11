# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AlloCat — minimalist personal-finance PWA, also shipped as a native Android app (Capacitor) for SMS-based transaction tracking. Next.js 16 (App Router) + React 19 + Supabase + Dexie (IndexedDB) + TanStack Query 5 + Tailwind v4. Currency is multi-currency via `lib/number-format.ts` + `lib/currency/catalog` (INR is the default for legacy callers); do **not** assume hardcoded `en-IN`.

`package.json` declares `name: "AlloCat-web"` despite the directory name.

## Commands

```bash
npm run dev         # next dev
npm run build       # next build && serwist build (service worker bundling)
npm run start       # next start
npm run lint        # eslint (flat config in eslint.config.mjs)
npm run test        # vitest run (one-shot)
npm run test:watch  # vitest (watch)

npx vitest run lib/sms/match.test.ts        # single file
npx vitest run -t "matches exact rule"      # single test by name
```

Test files live next to source (`*.test.ts`, e.g. `lib/ai/parseSmsTransaction.test.ts`, `lib/sms/match.test.ts`). No typecheck script — run `npx tsc --noEmit` if needed.

Use **pnpm** (per memory: `npm install` fails with ERESOLVE). Both `package-lock.json` and `pnpm-lock.yaml` are checked in.

### Android (Capacitor)

```bash
npx cap sync android                                  # copy web config + plugins into android/
CAP_SERVER_URL=http://192.168.1.20:3000 npx cap sync # point the shell at a LAN dev server
```

Requires Android Studio JBR (JDK 21). Open `android/` in Android Studio to build/run the APK.

## Required env (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # push, AI daily counter, Ko-fi supporter ledger, /admin
OPENROUTER_API_KEY=          # used by app/api/ai/chat
KOFI_VERIFICATION_TOKEN=     # app/api/kofi/webhook (503s without it)
NEXT_PUBLIC_KOFI_URL=        # where the support CTA points
ADMIN_EMAILS=                # comma-separated allowlist for /admin; unset ⇒ 404
CRON_SECRET=                 # bearer token for /api/admin/cron/play-sync
PLAY_SA_JSON_B64=            # base64 service-account JSON for Play install stats
PLAY_BUCKET=                 # pubsite_prod_<id>
```

See `.env.example` for the full list (web push, `NEXT_PUBLIC_SUPPORT_CTA_NATIVE`).

## Architecture

### Offline-first sync (the central pattern — read this before touching data flow)

Every page reads from IndexedDB first; the network is a fallback and a background reconciler. Three layers cooperate:

1. **IDB cache** — `lib/db/AllocatDB.ts` defines a Dexie schema mirroring the Supabase tables (`profiles`, `budgets`, `categories`, `budget_items`, `goals`, `assets`, `asset_categories`, `asset_value_history`, `debts`, `reports`, `net_worth_snapshots`, `activity_logs`, `merchant_rules`, `sms_transactions`) plus three sync infra tables: `sync_queue`, `id_map`, `sync_meta`. Currently at schema version 19. The DB is a browser-only singleton via `getDB()` — calling it on the server throws. Schema version bumps live in `AllocatDB.ts` constructor; add a new `.version(N).stores({...})` block, never mutate prior versions.

2. **Hydration + prefetch** — on mount, `SyncProvider` (`lib/providers/SyncProvider.tsx`) calls `hydrateAllTables()` (`lib/db/hydrate.ts`) which bulk-pulls every table for the current user into IDB. If `sync_meta.__userId__` differs from the active user, IDB is wiped first (multi-account device safety). After hydration, `prefetchAllQueries()` (`lib/db/prefetch.ts`) warms the React Query cache from IDB so first navigation has no skeletons. Use `qc.fetchQuery` (not `prefetchQuery`) when adding new prefetched keys — staleTime semantics would otherwise serve stale entries across reloads.

3. **Mutation queue** — mutations write to IDB optimistically (with a `temp_<uuid>` id for INSERTs), then `useEnqueue()` appends a `SyncQueueItem` to `sync_queue`. `SyncEngine` (`lib/sync/SyncEngine.ts`) drains the queue: each `(table, operation)` pair maps to a server action via the `dispatch` table — when adding new tables/operations, you must register a dispatcher entry there or the item will permanently fail. Failed items retry up to `MAX_RETRIES = 3` with backoff; permanent failures invoke `onRollback` (which invalidates relevant React Query keys). `temp_` ids inside payloads are rewritten to real ids via `id_map` before the action fires — use `extractTempIds` patterns when designing new payloads.

   Three request-shaping rules live in the drain (a phone that was closed for a day comes back with a queue full of SMS, and one request per item was the old behaviour):
   - **Batched ops** — `bulkDispatch` maps a `(table, operation)` to a server action taking an ARRAY (today: `sms_transactions:INSERT` → `ingestSmsTransactionsBulk`). Up to `MAX_BATCH` independent items go in one round trip; the action returns one `BulkIngestOutcome` per input **positionally**, so a single bad item retries alone. `onSynced` fires ONCE per group. To make an op batchable, add a bulk action + a `bulkDispatch` entry — never change the per-item semantics.
   - **Superseded writes are dropped unsent** — `selectSupersededIds` deletes an older `UPDATE` when the immediately-following queued op writes the *same field signature* to the same record (five slider drags → one request). Only tables in `COLLAPSIBLE_UPDATE_TABLES`, never a delta-bearing op (PAYMENT/CATEGORIZE/ACHIEVE) and never `actual_amount` (it cascades into a linked asset/debt and logs activity). Adding a new `UPDATE` payload shape? Check it is an absolute write before the table goes on that list.
   - **One post-sync refresh per drain** — the engine emits `onDrainEnd` when the queue comes to rest; `SyncProvider` accumulates `forceRefreshTable` targets during a drain and flushes them once there (the 150 ms coalesce timer only applies to isolated mutations).

Cancellation: `clearDB()` bumps a module-level generation counter in `lib/db/hydrate.ts`, and every pull re-checks it before writing. A hydrate already in flight when the user signs out (or switches account) therefore discards its payload instead of resurrecting the previous user's rows. Single-table refreshes read the user id from `auth.getSession()` (local) — **not** `getUser()`, which is a network call to Supabase Auth on every invocation.

Cross-cutting rules:
- Server actions live in `lib/actions/<domain>.ts` and are the *only* path that talks to Supabase from the client side. They are also called directly during initial fetch (IDB miss) and via SyncEngine on flush.
- Read hooks live in `lib/hooks/use<Domain>.ts`. The pattern is: `getXFromIDB()` first; on miss, fall back to the server action. Each hook exports its query key constant (e.g. `DASHBOARD_KEY`, `budgetKey(month, year)`) — reuse these for invalidation.
- Mutation hooks must: (1) write to IDB optimistically, (2) `enqueue` the operation, (3) invalidate matching query keys in `onSuccess`.

### Routing

- `app/admin/*` — internal admin portal (see below). Outside `(app)` on purpose.
- `app/(app)/*` — protected app shell (dashboard, budget, debt, goals, net-worth, profile, activity, **sms**, **support**). Layout wraps in `TourProvider` → `SyncProvider`, with mobile-first 480px frame and `md:` desktop layout.
- `app/auth/*` — login / signup / oauth callback.
- `app/onboarding/page.tsx` — post-signup flow.
- `app/share-target/` — PWA Web Share Target landing (manifest `share_target` posts here); shared text is parsed by `lib/ai/parseSpend.ts`.
- `app/api/ai/chat/route.ts` — streaming AI chat. Hard off-topic regex guard runs *before* the model call; topic detection in `lib/ai-utils.ts` decides which slice of `buildFinancialContext` to attach. AI is free for everyone; the only ceiling is `DAILY_AI_MESSAGES` (30/day/account) counted via the `increment_ai_usage` RPC, plus the per-instance burst limiter in `lib/server/rateLimit.ts`.
- `app/api/kofi/webhook/route.ts` — Ko-fi donation webhook (see *Monetization* below).
- `app/api/app-config/route.ts` — public force-update fields + runtime `flags`.
- `app/api/track/route.ts` — anonymous landing-site beacon (no IP/UA/cookie stored).
- `app/api/admin/*` — broadcast push + the Play install cron.

### Auth + middleware quirk

Auth uses `@supabase/ssr` with cookie-based sessions:
- `lib/supabase/server.ts` — server actions / RSCs
- `lib/supabase/client.ts` — browser
- `lib/supabase/middleware.ts` — `updateSession` refreshes tokens and gates routes

**Note**: The Next.js middleware file is named `proxy.ts` (not `middleware.ts`), exports a `proxy` function, and lives at the repo root. Do not rename it without verifying the Next 16 convention — both forms have existed across versions.

**Every matched request pays a Supabase Auth round trip**, so the matcher excludes `/api/*` and static assets, and `skipsAuth()` (`lib/supabase/middleware.ts`) additionally skips server-action POSTs (`Next-Action` header). Both authenticate themselves and — unlike an RSC render — can write the refreshed session cookie, so the middleware pass was pure duplication (a 40-item sync drain made 40 extra auth calls). Keep document/RSC navigations on the auth path: that is where the cookie rotation and the protected-route redirect happen.

Protected paths (redirect to `/auth/login` if no user): `/dashboard`, `/budget`, `/net-worth`, `/debt`, `/onboarding`. `/goals`, `/profile`, `/activity` are *not* in this list — confirm intent before adding new private routes.

### Monetization: there isn't any

AlloCat is **free for everyone** — no tiers, no trial, no caps, no paywall. The old Adapty/Play-Billing subscription system was removed entirely; if you find a reference to entitlement, premium, trial or paywall anywhere, it's stale and should go.

The only money surface is **optional support**:
- `app/(app)/support/` + `components/support/SupportPage.tsx` — the "Why AlloCat is free" page. Links out to Ko-fi (`lib/support/links.ts`); on native it opens the **system browser**, never an in-app checkout. The `support_cta_native` runtime flag hides that button on Android (Play-review escape hatch); `NEXT_PUBLIC_SUPPORT_CTA_NATIVE=false` is only its build-time default.
- `app/api/kofi/webhook/route.ts` — verifies Ko-fi's `verification_token`, banks the donation in `supporters` (idempotent on `last_message_id`), and flips `profiles.is_supporter`.
- `lib/actions/support.ts` `syncSupporterStatus()` — reconciles a donation made before signup; called once per session by `components/support/SupporterSync.tsx`.
- `useIsSupporter()` (`lib/hooks/useSupporter.ts`) — reads `profiles.is_supporter`. **Cosmetic only** (a `CrownBadge`). Never gate a feature on it: doing so would turn an off-Play donation into a purchase of digital content.

Migration: `docs/migrations/2026-07-29-supporters.sql`.

### Admin portal (`/admin`)

Internal-only insights + operations. Plain RSC + server actions — **no React Query, no Dexie**; the offline-first stack is for the user app and must not leak in here.

- **Access**: `lib/admin/guard.ts` → `requireAdmin()`. Email allowlist from the server-only `ADMIN_EMAILS`; a non-admin gets `notFound()` (404, not 403 — `/admin` should not advertise itself). Call it at the top of **every** page, server action and route handler; a layout check does not protect an independently addressable server action. `/admin` is also in the protected-prefix list in `lib/supabase/middleware.ts`.
- **Reads**: `lib/admin/queries.ts` (`server-only`) via `createServiceClient()` — RLS is uniformly "own row", so cross-user reads have no other path. Aggregates are Postgres functions (`admin_overview`, `admin_daily_series`, `admin_user_search`, `admin_user_detail`, `admin_feature_usage`) in `supabase/migrations/20260908000000_admin_portal.sql`, all `security definer` with EXECUTE revoked from `public, anon, authenticated`. supabase-js has no GROUP BY / COUNT DISTINCT — that is why they exist.
- **Writes**: `lib/admin/actions.ts`. New tables (`landing_events`, `play_install_stats`, `push_campaigns`) have RLS on with **zero policies**, i.e. service-role only, matching `supporters`.
- Pages: overview, growth (funnel + Play installs), users (+ detail, delete/force-signout/test-push), support (feedback inbox + Ko-fi ledger), broadcast, config.
- Charts are two inline-SVG components in `components/admin/charts/` — do not add a charting library.

**Active-user signal**: `activity_logs` records mutations only, so a user who opens the app daily just to read is invisible there. `touchLastSeen()` (`lib/actions/profile.ts`), called once per UTC day from `SyncProvider` and gated on a `localStorage` day key, writes two things: `profiles.last_seen_at` (for display on a user's detail page) and a row in **`user_active_days` (user_id, day)** — the actual DAU history. All DAU/WAU/MAU counts and the daily series read `user_active_days`; `last_seen_at` is a single overwritten column and **cannot** answer "how many were active on day X" (past buckets drain as users return). `activity_logs` distinct-users stays as the separate "engaged" number. Caveat: `SyncProvider` only mounts under `app/(app)/*`, so `/onboarding`, `/auth` and `/legal` do not count as activity.

**Platform (`profiles.last_app_mode`)**: written by that same daily `touchLastSeen()` call, from `Capacitor.isNativePlatform()`. It **must** be stamped client-side — the native shell is a Capacitor WebView of this same app, so `login()` and `/auth/callback` see an identical server request from both platforms and cannot distinguish them. Both previously hardcoded `'web'`, which made the column meaningless; that code and the old `updateAppMode()` action are gone. Do not reintroduce a server-side platform guess.

**Runtime flags** (`lib/config/flags.ts`, stored in `app_config.flags` jsonb): `ai_enabled`, `sms_enabled`, `support_cta_native`, `daily_ai_messages`. These exist because every `NEXT_PUBLIC_*` switch is inlined at build time and the thing needing a kill switch is usually an already-shipped Android build. Read server-side via `getServerFlags()` (60s memo, fails open) and client-side via `useAppFlags()`. `NEXT_PUBLIC_SUPPORT_CTA_NATIVE` is now only the *default* for `support_cta_native`.

**Play install stats**: Play exposes no REST API for installs — the numbers come from the bulk-report CSVs in the developer account's GCS bucket. `lib/play/installs.ts` signs its own JWT (no `google-auth-library` dependency) and `lib/play/csv.ts` parses. **Those CSVs are UTF-16LE with a BOM**; decoding as UTF-8 silently breaks every column lookup. Nightly via `vercel.json` cron → `/api/admin/cron/play-sync` (CRON_SECRET bearer), plus a manual "Sync now" button.

**Push has two transports, and neither reaches everyone.** Web Push (VAPID, `lib/server/push-notify.ts`) reaches browsers and installed PWAs. The Capacitor Android shell has **no Web Push API at all**, so it registers an FCM token instead (`components/pwa/PushRegistration.tsx` → `fcm_tokens`) and is reached via `lib/server/fcm.ts` (HTTP v1, self-signed JWT → OAuth, no `google-auth-library`). `lib/server/push-broadcast.ts` fans out over both; counts are per **device**, not per person.

**Do not add FCM to `notifyUser`.** SMS spend alerts are already raised on-device by `lib/sms/ingestClient.ts` (`notifyLocal`) while the server path calls `notifyUser` for the same event — adding FCM there double-notifies every native user. Broadcasts have no on-device twin, which is why they can use both transports safely.

Native push needs `android/app/google-services.json` (committed; not a secret, it ships in the APK) plus `FCM_PROJECT_ID` / `FCM_SA_JSON_B64`. The channel id `allocat-broadcast-v2` must match in three places: the manifest `default_notification_channel_id` meta-data, `LocalNotifications.createChannel` in `PushRegistration.tsx`, and `android.notification.channel_id` in `fcm.ts`. Token pruning only fires on 404/UNREGISTERED — never on a bare 400, which is also what a malformed payload returns.

**Landing funnel**: `grow.allocat.xyz` (the separate `allocat-landing` repo) fires `navigator.sendBeacon` at `/api/track`. Anonymous by design — event name, coarse platform, path, referrer *hostname*. No IP, no user agent, no cookie, no id. Event names are allowlisted server-side.

### Activity log

Server actions write to `activity_logs` via `lib/server/activity-logger.ts` (`logActivity` + `fmt` for INR formatting). Per memory: the SQL migration for the `activity_logs` table still needs to be run on Supabase if missing.

### Onboarding tour

Driver.js tour managed by `lib/tour/` — `TourContext` persists `{ enabled, seenPages }` in `localStorage` under `allocat-tour-state`. Add new pages by extending `tourSteps.ts` + `types.ts`.

### Native Android + SMS transaction tracking (Android-only)

The native app runs in **remote-URL WebView mode** (`capacitor.config.ts`): the shell loads the deployed Next.js app over the network, so SSR, server actions and the offline-first IDB layer work unchanged — no web assets are bundled (`webDir: "public"` is a CLI formality). `components/pwa/NativeShell.tsx` calls `SplashScreen.hide()` once mounted (auto-hide is disabled so users don't see a blank WebView during load).

The core native feature reads incoming bank/UPI **transaction** SMS and auto-categorizes spends. Full design in `docs/sms-feature.md`. Pipeline:

1. **Native receiver** (`android/app/src/main/java/app/allocat/mobile/`) — `SmsTransactionReceiver` fires even when the app is killed. `SmsFilter` applies an on-device financial-only gate (Play SMS-policy compliance). Messages are queued in `SmsQueue` (SharedPreferences); if the WebView is foregrounded, a `smsReceived` event is emitted. When app is closed, `SmsParser` (a Java port of the TS parser) + `SmsNotifier` post a transaction notification directly. **Only `RECEIVE_SMS` is declared — the app never reads the existing inbox (`READ_SMS` is intentionally absent).**
2. **JS bridge** — `components/pwa/SmsBridge.tsx` (native-only) listens for live events and drains the queue silently on open (native already notified). It mirrors merchant rules / quick-allocate targets / notif config into native via the `SmsReader` Capacitor plugin (`lib/native/SmsReader.ts`).
3. **Ingest** — `lib/sms/ingestClient.ts` parses on-device (`lib/ai/parseSmsTransaction.ts`, regex, **no LLM/network** — removed for Play compliance), matches a learned `merchant_rules` row (`lib/sms/match.ts`, exact > contains > regex), writes an optimistic `sms_transactions` IDB row, and enqueues a sync INSERT. **Privacy: only extracted fields + a hashed dedupe key sync to the server; the raw SMS body/sender stay on-device.** Only debits are tracked; credits are ignored.

Keep `SmsParser.java` regex in sync with `lib/ai/parseSmsTransaction.ts` (both are documented as needing to match). Notifications go through `lib/native/notify.ts` (`notifyLocal`, no-op on web); sounds in `android/app/src/main/res/raw/` mapped by `lib/native/notifSounds.ts`.

### PWA

**Serwist** (`@serwist/next`), not next-pwa. The service worker source is `app/sw.ts`, configured via `serwist.config.js`; `npm run build` runs `serwist build` after `next build`. Disabled in dev. Manifest at `app/manifest.ts` (includes `share_target` and shortcuts). Install prompt UI in `components/ui/InstallPrompt.tsx`.

## Git commit messages

Keep commit messages short and precise. No detailed explanations/bodies needed for routine commits — a single concise subject line is enough.

## Path alias

`@/*` → repo root (see `tsconfig.json`). Use it for all internal imports.

## Design system

Neo · Lime redesign with a runtime **accent system**: presets in `lib/theme/accents.ts` (`lime` default, plus tangerine/lemon/purple/blue). `data-accent` on `<html>` swaps tokens defined in `app/globals.css`; `AccentProvider` (`lib/providers/AccentProvider.tsx`) mirrors/persists the choice (`allocat-accent`), but the no-flash initial paint is a blocking script in `app/layout.tsx`. Light/dark via `next-themes` (`ThemeProvider`). Chart colors in `lib/theme/dataViz.ts`.

Fonts (root layout): Hanken Grotesk (`--font-sans`), Bricolage Grotesque (`--font-display`), JetBrains Mono (`--font-mono`). Material Symbols Outlined from Google Fonts. Tailwind v4 (PostCSS plugin in `postcss.config.mjs`, no `tailwind.config.*`).
