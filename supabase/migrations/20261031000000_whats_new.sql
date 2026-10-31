-- "What's new" changelog. Admin-authored entries, readable by any signed-in
-- user. Writes go through the service role only (no write policies).

create table if not exists public.whats_new_entries (
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

create index if not exists whats_new_entries_published_at_idx
  on public.whats_new_entries (published_at desc);

alter table public.whats_new_entries enable row level security;

drop policy if exists whats_new_entries_select on public.whats_new_entries;
create policy whats_new_entries_select on public.whats_new_entries
  for select to authenticated using (true);

drop trigger if exists whats_new_entries_set_updated_at on public.whats_new_entries;
create trigger whats_new_entries_set_updated_at
  before update on public.whats_new_entries
  for each row execute function public.set_updated_at();

-- Public bucket for entry images; service role uploads, public URL serves reads.
-- Raster images only (no SVG: script-capable when served publicly), ≤ 2 MB.
insert into storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
values (
  'whats-new', 'whats-new', true,
  array['image/png','image/jpeg','image/webp','image/gif'],
  2097152
)
on conflict (id) do update set
  public             = excluded.public,
  allowed_mime_types = excluded.allowed_mime_types,
  file_size_limit    = excluded.file_size_limit;
