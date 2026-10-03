-- Founding-member waitlist.
--
-- AlloCat stays free. Users can claim a spot that locks "founding-member
-- pricing" for when Premium eventually launches. This is the list we honour
-- at that point — email is snapshotted at claim time so the benefit can be
-- applied (or announced) even if the profile email later drifts.
--
-- Nothing in the app is gated on membership; it drives a cosmetic crown only.

-- ── Ledger ───────────────────────────────────────────────────────────────────
create table if not exists public.founding_members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text        not null,
  source     text        not null default 'app' check (source in ('app', 'kofi')),
  platform   text        check (platform in ('web', 'pwa', 'android')),
  claimed_at timestamptz not null default now()
);

alter table public.founding_members enable row level security;
-- Deliberately no policies: service-role only, like `supporters`. The claim
-- server action is the sole writer; clients read `profiles.founding_member_since`.

create index if not exists founding_members_claimed_at_idx
  on public.founding_members (claimed_at desc);

-- ── Profile mirror ───────────────────────────────────────────────────────────
-- Lets the offline-first app know membership from the already-hydrated
-- profile row (no new sync path). Bumps profiles.updated_at via its trigger,
-- so delta pulls pick it up.
alter table public.profiles
  add column if not exists founding_member_since timestamptz;

-- ── Back-fill past Ko-fi donors ──────────────────────────────────────────────
-- Thank-you: everyone who donated before Ko-fi was retired is a founding member.
insert into public.founding_members (user_id, email, source, claimed_at)
select p.id, p.email, 'kofi', coalesce(p.supporter_since, now())
from public.profiles p
where p.is_supporter
on conflict (user_id) do nothing;

update public.profiles p
set founding_member_since = f.claimed_at
from public.founding_members f
where f.user_id = p.id and p.founding_member_since is null;
