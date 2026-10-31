# What's new — design

## Intent

Features ship through the web without users noticing. A Play-Store-style
"What's new" changelog, edited from `/admin`, tells every user what changed and
gives a one-tap path to it from the home screen, the profile, and a push.

## Goals

- One global changelog, same for all users, managed in `/admin/whats-new`.
- Entry = title, markdown body, tags (`new` | `improved` | `fixed`), optional
  image, `published_at`. Saving publishes immediately. Editable + deletable.
- `/whats-new` page in the app, newest first. Reached from:
  - a "What's new" row in Profile (dot when there is an unseen entry),
  - a dashboard card (when an unseen entry exists),
  - a push notification.
- Admin "Notify everyone" per entry: title/body prefilled from the entry,
  editable, sent via the existing broadcast (web push + FCM, segment `all`),
  click URL `/whats-new`.
- Notified entries also land in the device-local Notifications inbox.
- A script + CLAUDE.md rule so Claude adds an entry after a feature merges to
  `main`.

## Non-goals / anti-goals

- No drafts, scheduling, per-platform targeting, or view/click tracking (the
  table should leave room to add targeting later, but not build it).
- No modal / interstitial on open — must not feel intrusive.
- Not part of the offline-first sync engine (read-only, global, tiny).
- The automatic Claude entry never sends a push.

## Data

Migration `supabase/migrations/20261031000000_whats_new.sql`:

```
whats_new_entries (
  id uuid pk default gen_random_uuid(),
  title text not null,
  body_md text not null default '',
  tags text[] not null default '{}',     -- subset of new/improved/fixed
  image_url text,
  published_at timestamptz not null default now(),
  notified_at timestamptz,              -- set when "Notify everyone" sent
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

- RLS on; one policy: `select` for `authenticated`. Writes via service role only
  (admin actions + script).
- `updated_at` trigger, matching existing tables' convention.
- Storage bucket `whats-new` (public read). Admin upload via service client.
- Tag check constraint on allowed values.

## App side

- `lib/actions/whatsNew.ts` — `getWhatsNewEntries()` server action (authed read,
  newest first, cap ~50).
- `lib/hooks/useWhatsNew.ts` — React Query (`WHATS_NEW_KEY`). Last result cached
  in `localStorage` (`allocat-whats-new-cache`) and used as `initialData` so the
  page renders offline. Exposes `useWhatsNewUnseen()`: latest `published_at` >
  `localStorage['allocat-whats-new-seen']` (per device — our call). Visiting
  `/whats-new` marks seen. Wrap all storage access in try/catch.
- `app/(app)/whats-new/page.tsx` + `components/whats-new/WhatsNewPage.tsx` —
  list with date, tag pills, image, body rendered by `react-markdown` (no raw
  HTML). Add `/whats-new` to `PROTECTED_PREFIXES` (+ test).
- Profile: "What's new" row in `ProfilePage.tsx` styled like sibling rows, with
  an accent dot when unseen.
- Dashboard: `components/whats-new/WhatsNewCard.tsx` rendered near
  `FoundingBanner`. Shows "New in AlloCat", latest entry title, its first tag,
  chevron; tap → `/whats-new`; × dismisses (marks seen). Hidden when nothing
  unseen. More prominent than the slim founding row but inline, not a modal.
- Inbox: on app open (inside `SyncProvider` mount or the card's hook), for each
  entry with `notified_at` not yet recorded (track ids in localStorage
  `allocat-whats-new-inboxed`), call `recordNotification({ kind: "whats-new",
  title, body, url: "/whats-new" })`. Add `"whats-new"` to `NotifKind`. Seed the
  recorded set on first run with only entries notified in the last 14 days so a
  new install doesn't get the entire backlog.

## Admin side

- `app/admin/whats-new/page.tsx` (+ `[id]` edit or inline editor), AdminNav item
  (`icon: "new_releases"`). `requireAdmin()` on every page and action.
- `lib/admin/whatsNew.ts` actions: create, update, delete, uploadImage, notify.
- Editor: title, tag toggles, markdown textarea with live preview (same renderer
  component as the app), image upload/remove.
- Notify: form prefilled (title = "What's new: <entry title>", body = first line
  of plain text from body), editable; calls `broadcastPush` with segment `all`,
  url `/whats-new`; sets `notified_at`. Confirm before sending.

## Claude rule

- `scripts/whats-new.mjs add --title ... --tags new,improved --body-file x.md`
  inserts via `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`. No push.
- CLAUDE.md: after merging a user-facing feature into `main`, write a 1–3 line
  user-friendly brief and run the script. Skip for refactors/fixes invisible to
  users.

## Deploy order

Migration (table + bucket) before the web build.

## Calls made by Claude (not explicitly decided by user)

Table over a single md file; per-device seen state; localStorage offline cache;
inline dashboard card instead of modal; inbox seeding window of 14 days;
notification title prefix.
