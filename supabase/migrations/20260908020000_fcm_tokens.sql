-- FCM device tokens, for admin broadcast push to the Android shell.
--
-- Why a second table instead of reusing `push_subscriptions`: the two transports
-- are not the same shape. Web Push is an endpoint URL plus a p256dh/auth keypair
-- and is signed with VAPID; FCM is a single opaque registration token sent to
-- Google's HTTP v1 API with an OAuth bearer. Forcing both into one table would
-- mean half the columns are null for every row and every reader has to branch.
--
-- The Android app is a Capacitor WebView, which has no Web Push API at all, so
-- without this table admin broadcasts can only ever reach browsers and PWAs.

create table if not exists public.fcm_tokens (
  token        text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  platform     text not null default 'android',
  app_version  text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists fcm_tokens_user_id_idx on public.fcm_tokens (user_id);

alter table public.fcm_tokens enable row level security;

-- Written by the user's own session when the app registers with FCM, so unlike
-- the other admin tables this needs real policies. Reads stay service-role only
-- (no SELECT policy): one user must never be able to enumerate another's
-- devices, and nothing in the app needs to read them back.
drop policy if exists "own fcm token insert" on public.fcm_tokens;
create policy "own fcm token insert"
  on public.fcm_tokens for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "own fcm token update" on public.fcm_tokens;
create policy "own fcm token update"
  on public.fcm_tokens for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sign-out drops the device's token so a shared device cannot keep receiving
-- pushes meant for the previous account.
drop policy if exists "own fcm token delete" on public.fcm_tokens;
create policy "own fcm token delete"
  on public.fcm_tokens for delete
  to authenticated
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Surface native reach in the admin overview, next to the web-push count.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_push_reach()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'web_subscriptions', (select count(*) from push_subscriptions),
    'web_users',         (select count(distinct user_id) from push_subscriptions),
    'fcm_tokens',        (select count(*) from fcm_tokens),
    'fcm_users',         (select count(distinct user_id) from fcm_tokens)
  );
$$;

revoke all on function public.admin_push_reach() from public, anon, authenticated;
