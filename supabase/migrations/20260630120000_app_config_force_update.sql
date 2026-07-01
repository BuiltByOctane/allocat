-- Remote config for the native force-update gate.
-- Single-row table holding the minimum required Android versionCode.
-- The native shell (ForceUpdateGate) reads this via /api/app-config and hard-blocks
-- the app when its installed versionCode is lower.

create table if not exists public.app_config (
  id int primary key default 1,
  min_android_version_code int not null default 0,
  update_message text,
  constraint app_config_singleton check (id = 1)
);

insert into public.app_config (id, min_android_version_code)
values (1, 0)
on conflict (id) do nothing;

alter table public.app_config enable row level security;

-- Public read: the gate must run before auth (pre-login). No write policy —
-- bump the value from the Supabase dashboard / SQL only.
drop policy if exists "app_config public read" on public.app_config;
create policy "app_config public read" on public.app_config
  for select to anon, authenticated using (true);
