-- Add app_mode tracking to profiles
-- Values: 'web' | 'android'
-- Updated on each login/session start from the respective client.

alter table public.profiles
  add column if not exists last_app_mode text
    check (last_app_mode in ('web', 'android'));
