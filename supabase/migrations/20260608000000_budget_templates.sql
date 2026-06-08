-- User-saved budget templates (custom reusable category/item presets).
-- Replaces the previous localStorage-only persistence (`allocat_user_templates`).
-- `categories` is a JSONB blob mirroring TemplateCategory[] in lib/budget-templates.ts.
-- Mirrors the init migration's conventions (updated_at trigger + per-row RLS).

-- ─── Helper: updated_at trigger (self-contained — does not assume init ran) ───
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── budget_templates ────────────────────────────────────────────────────────
create table if not exists public.budget_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  preview text[] not null default '{}',
  categories jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists budget_templates_user_id_idx on public.budget_templates(user_id);

drop trigger if exists budget_templates_set_updated_at on public.budget_templates;
create trigger budget_templates_set_updated_at
  before update on public.budget_templates
  for each row execute function public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.budget_templates enable row level security;

drop policy if exists "budget_templates_select_own" on public.budget_templates;
create policy "budget_templates_select_own" on public.budget_templates
  for select using (auth.uid() = user_id);

drop policy if exists "budget_templates_insert_own" on public.budget_templates;
create policy "budget_templates_insert_own" on public.budget_templates
  for insert with check (auth.uid() = user_id);

drop policy if exists "budget_templates_update_own" on public.budget_templates;
create policy "budget_templates_update_own" on public.budget_templates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "budget_templates_delete_own" on public.budget_templates;
create policy "budget_templates_delete_own" on public.budget_templates
  for delete using (auth.uid() = user_id);
