-- Admin portal: internal insights + operations surface at /admin.
--
-- Nothing here is reachable by an app user. Every new table has RLS enabled
-- with deliberately zero policies (service-role only, mirroring `supporters`),
-- and every admin_* function is `security definer` with EXECUTE revoked from
-- public/anon/authenticated — the same lockdown pattern as increment_ai_usage.
--
-- Rationale for functions instead of client queries: supabase-js cannot express
-- GROUP BY / COUNT DISTINCT, and every admin metric is an aggregate across all
-- users. Keeping them in SQL also means the service role never needs to stream
-- whole tables to Node just to count them.

-- ─────────────────────────────────────────────────────────────────────────────
-- Schema additions
-- ─────────────────────────────────────────────────────────────────────────────

-- Real activity signal. `activity_logs` only records mutations, so a user who
-- opens the app daily to read their budget looks inactive. Written at most once
-- per UTC day per user by lib/actions/profile.ts::touchLastSeen().
--
-- That same call now also writes `last_app_mode`. Until this migration, both
-- writers of that column (login + the OAuth callback) hardcoded 'web', because
-- they run on the server — and since Android became a Capacitor WebView of this
-- same Next app, the server sees an identical request from both platforms. Only
-- the client can tell, via Capacitor.isNativePlatform(). Existing rows therefore
-- all read 'web'/NULL and stay wrong until each user next opens the app.
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

create index if not exists profiles_last_seen_at_idx on public.profiles (last_seen_at desc);
create index if not exists profiles_created_at_idx   on public.profiles (created_at desc);

-- Lets the admin feedback inbox be cleared instead of growing forever.
alter table public.feedback
  add column if not exists resolved_at timestamptz;

create index if not exists feedback_unresolved_idx
  on public.feedback (created_at desc) where resolved_at is null;

-- Runtime kill switches, read by /api/app-config alongside the force-update
-- fields. Free-form so a new flag needs no migration. Known keys:
--   ai_enabled (bool), sms_enabled (bool), support_cta_native (bool),
--   daily_ai_messages (int)
alter table public.app_config
  add column if not exists flags jsonb not null default '{}'::jsonb;

-- ── Landing-site funnel events ───────────────────────────────────────────────
-- Anonymous counters only: no IP, no user agent, no cookie, no user id. Written
-- by app/api/track (service role) from grow.allocat.xyz beacons.
create table if not exists public.landing_events (
  id         uuid primary key default gen_random_uuid(),
  event      text not null,
  platform   text,
  path       text,
  referrer   text,            -- hostname only, never a full URL
  created_at timestamptz not null default now()
);

alter table public.landing_events enable row level security;
-- Deliberately no policies: service-role only.

create index if not exists landing_events_created_at_idx on public.landing_events (created_at desc);
create index if not exists landing_events_event_idx      on public.landing_events (event, created_at desc);

-- ── Play Store install stats ─────────────────────────────────────────────────
-- Mirrored nightly from the Play bulk-report CSVs in the pubsite_prod_* GCS
-- bucket (Play exposes no REST API for installs). See lib/play/installs.ts.
create table if not exists public.play_install_stats (
  day                      date not null,
  package                  text not null,
  daily_device_installs    int,
  daily_device_uninstalls  int,
  active_device_installs   int,
  total_user_installs      int,
  synced_at                timestamptz not null default now(),
  primary key (day, package)
);

alter table public.play_install_stats enable row level security;
-- Deliberately no policies: service-role only.

-- ── Broadcast push history ───────────────────────────────────────────────────
-- Audit trail + the thing that makes an accidental double-send obvious.
create table if not exists public.push_campaigns (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  url          text,
  segment      text not null,
  sent_count   int  not null default 0,
  failed_count int  not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.push_campaigns enable row level security;
-- Deliberately no policies: service-role only.

create index if not exists push_campaigns_created_at_idx on public.push_campaigns (created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Metrics functions
-- ─────────────────────────────────────────────────────────────────────────────

-- Every tile on /admin in one round trip.
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
      'dau',        (select count(*) from profiles where last_seen_at >= now() - interval '1 day'),
      'wau',        (select count(*) from profiles where last_seen_at >= now() - interval '7 days'),
      'mau',        (select count(*) from profiles where last_seen_at >= now() - interval '30 days'),
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
      -- Donated before signing up; /admin/support can link these by hand.
      'unlinked',     (select count(*) from supporters where user_id is null),
      'total_amount', (select coalesce(sum(total_amount), 0) from supporters)
    ),

    'ai', jsonb_build_object(
      'messages_today', (select coalesce(sum(ai_usage.count), 0) from ai_usage
                          where day = (now() at time zone 'utc')::date),
      'users_today',    (select count(*) from ai_usage
                          where day = (now() at time zone 'utc')::date),
      -- Hit the DAILY_AI_MESSAGES ceiling in app/api/ai/chat.
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

-- One row per day for the whole window — powers every sparkline on the portal
-- from a single call. Days are UTC to match ai_usage.day.
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
    (select count(*) from profiles p
       where (p.last_seen_at at time zone 'utc')::date = d.day)::int,
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

-- Email / name / id lookup for the support desk. Hard-capped so a stray empty
-- query can never stream the whole user table.
create or replace function public.admin_user_search(p_q text, p_limit int default 30)
returns table (
  id           uuid,
  email        text,
  full_name    text,
  is_onboarded boolean,
  is_supporter boolean,
  last_app_mode text,
  currency     text,
  created_at   timestamptz,
  last_seen_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.email, p.full_name, p.is_onboarded, p.is_supporter,
         p.last_app_mode, p.currency, p.created_at, p.last_seen_at
  from profiles p
  where coalesce(nullif(trim(p_q), ''), '') = ''
     or p.email ilike '%' || trim(p_q) || '%'
     or p.full_name ilike '%' || trim(p_q) || '%'
     or p.id::text = trim(p_q)
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- Everything /admin/users/[id] shows, in one call.
create or replace function public.admin_user_detail(p_user uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from profiles p where p.id = p_user),
    'counts', jsonb_build_object(
      'budgets',          (select count(*) from budgets where user_id = p_user),
      'budget_items',     (select count(*) from budget_items where user_id = p_user),
      'assets',           (select count(*) from assets where user_id = p_user),
      'debts',            (select count(*) from debts where user_id = p_user),
      'sms_transactions', (select count(*) from sms_transactions where user_id = p_user),
      'merchant_rules',   (select count(*) from merchant_rules where user_id = p_user),
      'activity_logs',    (select count(*) from activity_logs where user_id = p_user),
      'push_subs',        (select count(*) from push_subscriptions where user_id = p_user)
    ),
    'ai_usage_7d', coalesce((
      select jsonb_agg(jsonb_build_object('day', u.day, 'count', u.count) order by u.day)
      from ai_usage u
      where u.user_id = p_user and u.day >= (now() at time zone 'utc')::date - 6
    ), '[]'::jsonb),
    'supporter', (select to_jsonb(s) from supporters s where s.user_id = p_user),
    'recent_activity', coalesce((
      select jsonb_agg(x order by x.created_at desc)
      from (
        select a.action_type, a.category, a.title, a.description, a.created_at
        from activity_logs a
        where a.user_id = p_user
        order by a.created_at desc
        limit 20
      ) x
    ), '[]'::jsonb),
    'feedback', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'kind', f.kind, 'message', f.message,
        'app_version', f.app_version, 'platform', f.platform,
        'created_at', f.created_at, 'resolved_at', f.resolved_at
      ) order by f.created_at desc)
      from feedback f where f.user_id = p_user
    ), '[]'::jsonb)
  );
$$;

-- Which parts of the product people actually touch.
create or replace function public.admin_feature_usage()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'sms_users',        (select count(distinct user_id) from sms_transactions),
    'sms_categorized',  (select count(*) from sms_transactions where status = 'categorized'),
    'sms_pending',      (select count(*) from sms_transactions where status = 'pending'),
    'merchant_rules',   (select count(*) from merchant_rules),
    'rule_applications',(select coalesce(sum(times_applied), 0) from merchant_rules),
    'templates',        (select count(*) from budget_templates),
    'goals',            (select count(*) from assets where is_goal),
    'goals_achieved',   (select count(*) from assets where is_goal and achieved_at is not null),
    'debts',            (select count(*) from debts),
    'reports',          (select count(*) from reports),
    'push_optin_pct',   (select case when (select count(*) from profiles) = 0 then 0
                           else round(100.0 * (select count(distinct user_id) from push_subscriptions)
                                      / (select count(*) from profiles), 1) end),
    'by_currency', coalesce((
      select jsonb_object_agg(c.currency, c.n)
      from (select currency, count(*) as n from profiles group by currency) c
    ), '{}'::jsonb)
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Lockdown: service role only. Without these revokes any logged-in user could
-- call these and read the entire user base.
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.admin_overview()                  from public, anon, authenticated;
revoke all on function public.admin_daily_series(int)           from public, anon, authenticated;
revoke all on function public.admin_user_search(text, int)      from public, anon, authenticated;
revoke all on function public.admin_user_detail(uuid)           from public, anon, authenticated;
revoke all on function public.admin_feature_usage()             from public, anon, authenticated;
