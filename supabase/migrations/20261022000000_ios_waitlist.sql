-- iOS auto-tracking waitlist.
--
-- Collected from the landing site (grow.allocat.xyz) via app/api/waitlist so we
-- can tell iPhone visitors auto-tracking is coming, and learn whether they need
-- a native App Store app or are happy with the web app. `preference` is the
-- input for that build decision.
--
-- Emails are lowercased by the route before insert, and the check constraint
-- enforces it, so a plain unique constraint on `email` is enough for upsert
-- (supabase-js `onConflict` cannot target an expression index).
--
-- No IP, no user agent: the same privacy stance as landing_events.

create table if not exists public.ios_waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique check (email = lower(email)),
  preference text not null check (preference in ('native', 'web', 'either')),
  source     text,            -- 'cta' | 'home_section'
  platform   text,            -- 'ios' | 'android' | 'desktop' (coarse, from the landing UA)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ios_waitlist enable row level security;
-- Deliberately no policies: service-role only.

create index if not exists ios_waitlist_created_at_idx on public.ios_waitlist (created_at desc);
