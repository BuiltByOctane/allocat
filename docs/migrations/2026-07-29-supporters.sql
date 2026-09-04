-- Free-forever pivot: replaces the subscription/entitlement model.
--
-- AlloCat is free for everyone. Nothing in this file gates a feature — the
-- supporter flag drives a cosmetic thank-you badge only. Donations are handled
-- entirely off-app by Ko-fi; we never see card data.
--
-- Supersedes 2026-06-14-profiles-subscription.sql. Those columns are left in
-- place (unread) rather than dropped, so this migration is non-destructive.

-- ── Supporter flag on profiles ───────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_supporter    boolean not null default false,
  add column if not exists supporter_since timestamptz;

-- ── Donor ledger ─────────────────────────────────────────────────────────────
-- One row per donor email. A row can exist before the person has an account
-- (donated first, signed up later) — lib/actions/support.ts reconciles that.
create table if not exists public.supporters (
  email              text primary key,
  user_id            uuid references auth.users(id) on delete set null,
  first_supported_at timestamptz not null default now(),
  last_supported_at  timestamptz not null default now(),
  total_amount       numeric     not null default 0,
  currency           text,
  source             text        not null default 'kofi',
  -- Ko-fi retries on non-2xx; this makes replays idempotent.
  last_message_id    text unique,
  created_at         timestamptz not null default now()
);

alter table public.supporters enable row level security;
-- Deliberately no policies: service-role only. Clients read `is_supporter`
-- off their own profiles row instead.

create index if not exists supporters_user_id_idx on public.supporters (user_id);

-- ── AI usage quota ───────────────────────────────────────────────────────────
-- AI chat is free for everyone, but the model costs money, so each account gets
-- a durable daily message allowance. The in-memory limiter in
-- lib/server/rateLimit.ts is per-instance burst dampening; this is the real cap.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  count   int  not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;
-- Service-role only; the chat route is the sole writer.

-- Atomic increment — returns the user's new count for today.
create or replace function public.increment_ai_usage(p_user uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.ai_usage (user_id, day, count)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day)
    do update set count = ai_usage.count + 1
  returning count into v_count;
  return v_count;
end;
$$;

revoke all on function public.increment_ai_usage(uuid) from public, anon, authenticated;

-- Housekeeping: old usage rows are worthless after a couple of days.
-- Run manually or from a scheduled job:
--   delete from public.ai_usage where day < (now() at time zone 'utc')::date - 7;
