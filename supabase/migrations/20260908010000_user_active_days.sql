-- Real daily-active history.
--
-- 20260908000000 added `profiles.last_seen_at` and derived the admin portal's
-- activity series from it. That works for the DAU/WAU/MAU tiles ("seen within
-- the last N days") but NOT for a per-day series: last_seen_at is a single
-- overwritten column with no history, so `last_seen_at::date = <day>` counts
-- "users whose most recent visit was that day". Every past bucket drains as
-- those users come back, producing a curve that decays toward zero the further
-- back you look regardless of real usage.
--
-- One row per (user, day) fixes it. It is written by the same once-per-UTC-day
-- call that already stamps last_seen_at, so it costs no extra requests.
-- `last_seen_at` stays — it is still the right thing to show on a user's detail
-- page, and it is a cheap indexed lookup.

create table if not exists public.user_active_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  primary key (user_id, day)
);

create index if not exists user_active_days_day_idx on public.user_active_days (day);

alter table public.user_active_days enable row level security;

-- Unlike the other admin tables, this one is written by the *user's own*
-- session (lib/actions/profile.ts::touchLastSeen uses the cookie client), so it
-- needs an insert policy. There is deliberately no SELECT policy: reads are
-- aggregate-only and go through the service role, exactly like ai_usage.
drop policy if exists "own active day insert" on public.user_active_days;
create policy "own active day insert"
  on public.user_active_days for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Point the metrics at it.
--
-- The tiles and the series now read the same source, so they can no longer
-- disagree. Note this table starts empty: the series is flat until users open
-- the app, and full 30-day numbers take 30 days to accumulate. The historical
-- gap is not backfillable — the data never existed.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.admin_overview()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'generated_at', now(),

    'users', jsonb_build_object(
      'total',     (select count(*) from profiles),
      'onboarded', (select count(*) from profiles where is_onboarded),
      'new_1d',    (select count(*) from profiles where created_at >= now() - interval '1 day'),
      'new_7d',    (select count(*) from profiles where created_at >= now() - interval '7 days'),
      'new_30d',   (select count(*) from profiles where created_at >= now() - interval '30 days'),
      'android',   (select count(*) from profiles where last_app_mode = 'android'),
      'web',       (select count(*) from profiles where last_app_mode is distinct from 'android')
    ),

    'active', jsonb_build_object(
      'dau', (select count(distinct user_id) from user_active_days
               where day >= (now() at time zone 'utc')::date),
      'wau', (select count(distinct user_id) from user_active_days
               where day >= (now() at time zone 'utc')::date - 6),
      'mau', (select count(distinct user_id) from user_active_days
               where day >= (now() at time zone 'utc')::date - 29),
      -- Users who actually changed something, as opposed to merely opening the app.
      'engaged_7d', (select count(distinct user_id) from activity_logs
                      where created_at >= now() - interval '7 days')
    ),

    'push', jsonb_build_object(
      'subscriptions', (select count(*) from push_subscriptions),
      'users',         (select count(distinct user_id) from push_subscriptions)
    ),

    'supporters', jsonb_build_object(
      'count',        (select count(*) from supporters),
      'unlinked',     (select count(*) from supporters where user_id is null),
      'total_amount', (select coalesce(sum(total_amount), 0) from supporters)
    ),

    'ai', jsonb_build_object(
      'messages_today', (select coalesce(sum(ai_usage.count), 0) from ai_usage
                          where day = (now() at time zone 'utc')::date),
      'users_today',    (select count(*) from ai_usage
                          where day = (now() at time zone 'utc')::date),
      'capped_today',   (select count(*) from ai_usage
                          where day = (now() at time zone 'utc')::date and ai_usage.count >= 30)
    ),

    'feedback', jsonb_build_object(
      'unresolved', (select count(*) from feedback where resolved_at is null),
      'bugs',       (select count(*) from feedback where resolved_at is null and kind = 'bug')
    ),

    'sms', jsonb_build_object(
      'txns_total',  (select count(*) from sms_transactions),
      'users',       (select count(distinct user_id) from sms_transactions),
      'txns_7d',     (select count(*) from sms_transactions where created_at >= now() - interval '7 days')
    ),

    'installs', coalesce(
      (select jsonb_build_object(
         'day',              i.day,
         'active_devices',   i.active_device_installs,
         'total_users',      i.total_user_installs,
         'daily_installs',   i.daily_device_installs,
         'daily_uninstalls', i.daily_device_uninstalls,
         'synced_at',        i.synced_at
       )
       from play_install_stats i
       order by i.day desc
       limit 1),
      '{}'::jsonb
    ),

    'landing', jsonb_build_object(
      'views_7d',       (select count(*) from landing_events
                          where event = 'page_view' and created_at >= now() - interval '7 days'),
      'play_clicks_7d', (select count(*) from landing_events
                          where event = 'cta_play_click' and created_at >= now() - interval '7 days')
    )
  );
$$;

create or replace function public.admin_daily_series(p_days int default 30)
returns table (
  day           date,
  signups       int,
  active_users  int,
  engaged_users int,
  ai_messages   int,
  sms_txns      int,
  play_clicks   int,
  installs      int,
  uninstalls    int
)
language sql
security definer
stable
set search_path = public
as $$
  with d as (
    select generate_series(
      (now() at time zone 'utc')::date - (greatest(coalesce(p_days, 30), 1) - 1),
      (now() at time zone 'utc')::date,
      interval '1 day'
    )::date as day
  )
  select
    d.day,
    (select count(*) from profiles p
       where (p.created_at at time zone 'utc')::date = d.day)::int,
    -- True DAU: one row per user per day they opened the app.
    (select count(*) from user_active_days a where a.day = d.day)::int,
    (select count(distinct a.user_id) from activity_logs a
       where (a.created_at at time zone 'utc')::date = d.day)::int,
    (select coalesce(sum(u.count), 0) from ai_usage u where u.day = d.day)::int,
    (select count(*) from sms_transactions s
       where (s.created_at at time zone 'utc')::date = d.day)::int,
    (select count(*) from landing_events e
       where e.event = 'cta_play_click'
         and (e.created_at at time zone 'utc')::date = d.day)::int,
    (select coalesce(max(i.daily_device_installs), 0) from play_install_stats i
       where i.day = d.day)::int,
    (select coalesce(max(i.daily_device_uninstalls), 0) from play_install_stats i
       where i.day = d.day)::int
  from d
  order by d.day;
$$;

revoke all on function public.admin_overview()        from public, anon, authenticated;
revoke all on function public.admin_daily_series(int) from public, anon, authenticated;

-- Seed today from the existing column so the portal is not empty on day one.
insert into public.user_active_days (user_id, day)
select id, (last_seen_at at time zone 'utc')::date
from public.profiles
where last_seen_at is not null
on conflict do nothing;
