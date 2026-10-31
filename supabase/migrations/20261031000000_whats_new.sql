-- "What's new" changelog. Admin-authored entries, readable by any signed-in
-- user. Writes go through the service role only (no write policies).

create table if not exists public.whats_new (
  id           uuid primary key default gen_random_uuid(),
  title        text        not null,
  body_md      text        not null default '',
  tags         text[]      not null default '{}'
                 check (tags <@ array['new','improved','fixed']::text[]),
  image_url    text,
  published_at timestamptz not null default now(),
  notified_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists whats_new_published_at_idx
  on public.whats_new (published_at desc);

alter table public.whats_new enable row level security;

drop policy if exists whats_new_select on public.whats_new;
create policy whats_new_select on public.whats_new
  for select to authenticated using (true);

drop trigger if exists whats_new_set_updated_at on public.whats_new;
create trigger whats_new_set_updated_at
  before update on public.whats_new
  for each row execute function public.set_updated_at();

-- Public bucket for entry images; service role uploads, public URL serves reads.
insert into storage.buckets (id, name, public)
values ('whats-new', 'whats-new', true)
on conflict (id) do nothing;
