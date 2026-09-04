<div align="center">
  <img src="public/paw.png" alt="AlloCat" width="96" height="96" />

  # AlloCat

  **personal finance, allocated like a cat plans its naps.**

  Budgets, debts, goals, and net worth — all in one minimalist PWA that works without a network and syncs when it has one.

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
  [![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
  [![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)
  [![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ecf8e)](https://supabase.com)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/devoctane/allocat/pulls)

  [Live App](https://grow.allocat.xyz) · [Report Bug](https://github.com/devoctane/allocat/issues) · [Request Feature](https://github.com/devoctane/allocat/issues)
</div>

---

## Table of Contents

- [About](#about)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Supabase Setup](#supabase-setup)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Code of Conduct](#code-of-conduct)
- [License](#license)
- [Maintainer](#maintainer)
- [Acknowledgements](#acknowledgements)

---

## About

AlloCat is a minimalist, personal-finance Application. Track budgets, debts, savings goals, assets, and net worth in one place. The app reads from a local IndexedDB cache first and reconciles with Supabase in the background, so it stays fast and usable even on flaky networks or fully offline.

Hosted at **[allocat.xyz](https://allocat.xyz)**. Works on mobile, desktop, and installs as a PWA.

## Features

- **Budget** — monthly budgets with categories, items, and templates
- **Debt** — track loans, EMIs, payoff progress
- **Goals** — savings goals merged with assets for unified net-worth view
- **Net Worth** — assets, liabilities, history snapshots
- **Activity Log** — audit trail of every change with INR-formatted summaries
- **AI Chat** — ask questions about your finances; OpenRouter-powered, topic-guarded
- **Offline-first** — IndexedDB cache + mutation queue; full functionality without network
- **PWA** — installable on iOS, Android, desktop; service worker pre-cached
- **Onboarding tour** — Driver.js-guided walkthrough on first visit

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4 |
| State / cache | TanStack Query 5 |
| Local DB | Dexie (IndexedDB) |
| Backend | Supabase (Postgres + Auth + RLS) |
| Auth | `@supabase/ssr` (cookie sessions) |
| AI | OpenRouter streaming chat |
| PWA | Serwist (`@serwist/next`) |
| Tour | Driver.js |
| Icons | Lucide + Material Symbols Outlined |
| Fonts | Inter Tight, Bricolage Grotesque, JetBrains Mono |

## Architecture

AlloCat is **offline-first**. Three layers cooperate:

1. **IDB cache** (`lib/db/AllocatDB.ts`) — Dexie schema mirrors Supabase tables plus three sync tables (`sync_queue`, `id_map`, `sync_meta`). Every page reads here first.
2. **Hydration + prefetch** (`lib/providers/SyncProvider.tsx`) — on mount, bulk-pulls all tables for the active user into IDB, then warms React Query cache so first navigation has zero skeletons. Wipes IDB on user switch.
3. **Mutation queue** (`lib/sync/SyncEngine.ts`) — mutations write to IDB optimistically with `temp_<uuid>` ids, enqueue a `SyncQueueItem`, then SyncEngine drains it via server actions. Failed items retry with backoff (max 3); permanent failures roll back and invalidate query keys.

Server actions in `lib/actions/<domain>.ts` are the **only** path that talks to Supabase from the client. Read hooks (`lib/hooks/use<Domain>.ts`) follow the pattern: try IDB → fall back to server action.

See [`CLAUDE.md`](./CLAUDE.md) for a deeper dive intended for AI assistants and contributors.

## Getting Started

### Prerequisites

- **Node.js** 20+ (LTS recommended)
- **pnpm** 9+ — this project pins pnpm via `pnpm-lock.yaml`. Install with `npm i -g pnpm` if you don't have it.
- **Supabase** project (free tier works) — see [Supabase Setup](#supabase-setup)
- **OpenRouter** API key (optional, only for AI chat) — [openrouter.ai](https://openrouter.ai)

### Installation

```bash
# 1. Clone
git clone https://github.com/devoctane/allocat.git
cd allocat

# 2. Install
pnpm install

# 3. Configure env
cp .env.example .env.local
# fill in Supabase URL + keys (see Environment Variables below)

# 4. Run the SQL init migration on your Supabase project (see Supabase Setup)

# 5. Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase Setup

AlloCat needs Postgres tables, Row Level Security policies, and auth wired up.

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a new project, and grab:
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- Publishable (anon) key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

### 2. Run migrations

SQL migrations live in `supabase/migrations/`. The init migration creates every table, index, foreign key, RLS policy, and the `handle_new_user` trigger that auto-provisions a `profiles` row on signup.

**Option A — Supabase CLI (recommended)**

```bash
# install CLI: https://supabase.com/docs/guides/cli
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B — SQL Editor (manual)**

Open the Supabase dashboard → SQL Editor → paste each file from `supabase/migrations/` in chronological order and run. Start with `20260101000000_init.sql`.

### 3. Required tables

After migrations, your Postgres should have: `profiles`, `budgets`, `categories`, `budget_items`, `assets`, `asset_categories`, `asset_value_history`, `debts`, `reports`, `net_worth_snapshots`, `activity_logs`, `push_subscriptions`.

> **Note:** if any table is missing the app will fail on first write. Confirm the migration completed cleanly in the SQL Editor output (no `ERROR:` rows).

### 4. Auth providers

In Supabase dashboard → Authentication → Providers, enable:
- **Email** (default)
- **Google OAuth** (optional, used by `/auth/oauth-callback`)

Set the redirect URL to `http://localhost:3000/auth/oauth-callback` for dev and your production domain for prod.

### 5. RLS

Row Level Security is enabled by the init migration and policies restrict every table to `auth.uid() = user_id` (or `id` for `profiles`). Verify in dashboard → Authentication → Policies that each table shows policies enabled — without RLS, every user sees every row.

### 6. Push notifications (optional)

To enable browser push notifications, generate VAPID keys and add them to `.env.local`:

```bash
npx web-push generate-vapid-keys
```

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:you@example.com`), and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (same value as the public key). Omit all four to disable push silently.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Yes | Supabase publishable (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes\* | Service-role key. Required for sending push notifications. App boots without it but push will throw at runtime. |
| `OPENROUTER_API_KEY` | No | OpenRouter API key for AI chat. Omit to disable `/api/ai/chat`. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | No | Public VAPID key exposed to the browser for push subscriptions. |
| `VAPID_PUBLIC_KEY` | No | Same as above, server-side. |
| `VAPID_PRIVATE_KEY` | No | Private VAPID key. Keep secret. |
| `VAPID_SUBJECT` | No | Contact URI (`mailto:...` or `https://...`) required by web-push. |

\* If you don't need push notifications you can omit the service role key — every other feature works on the publishable key alone.

Never commit `.env.local`. It is gitignored.

## Available Scripts

```bash
pnpm dev      # Next dev server (Turbopack)
pnpm build    # Production build (PWA enabled)
pnpm start    # Start production server
pnpm lint     # ESLint (flat config)
```

No test runner is configured yet — see [Roadmap](#roadmap). For type checking:

```bash
pnpm exec tsc --noEmit
```

### Android Release Build (Play Store AAB)

Before building, bump `versionCode` in `android/app/build.gradle`. Then run from the repo root:

```bash
cd android && JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-24.jdk/Contents/Home ./gradlew bundleRelease
```

> **Why `JAVA_HOME` override?** The system default JDK is Java 19, but Capacitor Android requires Java 21+ source compatibility. JDK 24 (already installed) satisfies this.

Signing is handled automatically via `android/app/keystore.properties` (gitignored). The signed `.aab` is output to:

```
android/app/build/outputs/bundle/release/app-release.aab
```

Upload this file to the Play Console → Internal Testing (or the target track).

## Project Structure

```
allocat/
├── app/
│   ├── (app)/           # Protected app shell — dashboard, budget, debt, goals, net-worth, profile, activity
│   ├── auth/            # Login, signup, OAuth callback
│   ├── onboarding/      # Post-signup flow
│   ├── api/ai/chat/     # Streaming AI chat endpoint
│   └── manifest.ts      # PWA manifest
├── components/          # UI components organized by domain
├── lib/
│   ├── actions/         # Server actions (only Supabase entrypoint from client)
│   ├── db/              # Dexie schema, hydration, prefetch
│   ├── hooks/           # Read hooks (IDB → server action fallback)
│   ├── providers/       # SyncProvider, query client, theme
│   ├── server/          # activity-logger and other server-only utils
│   ├── sync/            # SyncEngine, mutation queue
│   ├── supabase/        # client/server/middleware Supabase factories
│   └── tour/            # Driver.js tour steps + context
├── public/              # Static assets, PWA icons
├── supabase/migrations/ # SQL migrations
├── proxy.ts             # Next.js middleware (named proxy.ts in Next 16)
└── CLAUDE.md            # Architecture deep-dive
```

Path alias: `@/*` → repo root.


Have an idea? [Open an issue](https://github.com/devoctane/allocat/issues/new).

## Contributing

Contributions are welcome and appreciated. Whether it is a bug report, feature request, doc fix, or pull request — every bit helps.

### Workflow

1. **Fork** the repo and clone your fork
2. **Branch** from `main`: `git checkout -b feat/your-feature` or `fix/your-bug`
3. **Install** deps: `pnpm install`
4. **Hack** away. Keep changes focused — one PR, one concern.
5. **Lint** before pushing: `pnpm lint`
6. **Type-check**: `pnpm exec tsc --noEmit`
7. **Commit** using [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `chore:`
8. **Push** and open a PR against `main`

### PR checklist

- [ ] Lint passes
- [ ] Type check passes
- [ ] Existing offline-first patterns preserved (IDB → enqueue → invalidate)
- [ ] New tables / operations registered in `SyncEngine` dispatch table
- [ ] No secrets committed
- [ ] Screenshots / video for UI changes
- [ ] CLAUDE.md updated if architecture changed

### Areas where help is especially welcome

- Tests (currently none)
- Multi-currency formatting
- Accessibility audit
- Documentation and tutorials
- Migration tooling for self-hosters

### Reporting bugs

Open an issue with:
- What you expected
- What happened
- Steps to reproduce
- Browser / OS / app version
- Screenshots if relevant

### Security

Found a security issue? **Do not open a public issue.** Email `ashwinkv.octane@gmail.com` directly.

## Code of Conduct

Be kind. Be respectful. Assume good faith. Harassment, discrimination, or hostile behavior is not tolerated and will result in removal from the project.

This project follows the spirit of the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Report violations to `ashwinkv.octane@gmail.com`.

## License

[MIT](./LICENSE) © Octane

## Maintainer

**Ashwin KV** — [@devoctane](https://github.com/devoctane) · `ashwinkv.octane@gmail.com`

## Acknowledgements

Built on the shoulders of:

- [Next.js](https://nextjs.org)
- [Supabase](https://supabase.com)
- [Dexie](https://dexie.org)
- [TanStack Query](https://tanstack.com/query)
- [Tailwind CSS](https://tailwindcss.com)
- [Driver.js](https://driverjs.com)
- [Vaul](https://vaul.emilkowal.ski)
- [OpenRouter](https://openrouter.ai)

Made with care by [Octane](https://github.com/devoctane).
