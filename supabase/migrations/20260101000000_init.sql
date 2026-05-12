-- AlloCat initial schema
-- Tables, indexes, FKs, RLS, triggers. Idempotent where practical.

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Helper: updated_at trigger ──────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  is_onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─── budgets ─────────────────────────────────────────────────────────────────
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  year smallint not null check (year between 1970 and 9999),
  total_budget numeric(14,2) not null default 0,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month, year)
);

create index if not exists budgets_user_id_idx on public.budgets(user_id);
create index if not exists budgets_user_month_year_idx on public.budgets(user_id, month, year);

drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

-- ─── categories ──────────────────────────────────────────────────────────────
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  type text not null check (type in ('needs','wants','investments','misc')),
  allocated_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists categories_budget_id_idx on public.categories(budget_id);
create index if not exists categories_user_id_idx on public.categories(user_id);

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- ─── budget_items ────────────────────────────────────────────────────────────
create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  planned_amount numeric(14,2) not null default 0,
  actual_amount numeric(14,2) not null default 0,
  is_completed boolean not null default false,
  notes text,
  link_type text check (link_type in ('asset','debt')),
  link_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists budget_items_category_id_idx on public.budget_items(category_id);
create index if not exists budget_items_user_id_idx on public.budget_items(user_id);
create index if not exists budget_items_link_idx on public.budget_items(link_type, link_id);

drop trigger if exists budget_items_set_updated_at on public.budget_items;
create trigger budget_items_set_updated_at
  before update on public.budget_items
  for each row execute function public.set_updated_at();

-- ─── asset_categories ────────────────────────────────────────────────────────
create table if not exists public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists asset_categories_user_id_idx on public.asset_categories(user_id);

-- ─── assets ──────────────────────────────────────────────────────────────────
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  category text,
  category_id uuid references public.asset_categories(id) on delete set null,
  value numeric(14,2) not null default 0,
  invested_amount numeric(14,2) not null default 0,
  is_goal boolean not null default false,
  target_amount numeric(14,2),
  achieved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assets_user_id_idx on public.assets(user_id);
create index if not exists assets_user_is_goal_idx on public.assets(user_id, is_goal);
create index if not exists assets_achieved_at_idx on public.assets(achieved_at);

drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at
  before update on public.assets
  for each row execute function public.set_updated_at();

-- ─── asset_value_history ─────────────────────────────────────────────────────
create table if not exists public.asset_value_history (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('initial','add_funds','withdraw','update_value')),
  amount numeric(14,2) not null,
  running_total numeric(14,2) not null,
  note text,
  entry_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists asset_value_history_asset_id_idx on public.asset_value_history(asset_id);
create index if not exists asset_value_history_user_id_idx on public.asset_value_history(user_id);
create index if not exists asset_value_history_entry_date_idx on public.asset_value_history(entry_date);

-- ─── debts ───────────────────────────────────────────────────────────────────
create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  type text not null check (type in ('internal','external','lent')),
  principal numeric(14,2) not null default 0,
  interest_rate numeric(6,3) not null default 0,
  monthly_minimum numeric(14,2) not null default 0,
  total_paid numeric(14,2) not null default 0,
  is_closed boolean not null default false,
  expected_payoff_date date,
  interest_type text not null default 'flat' check (interest_type in ('flat','diminishing')),
  loan_tenure_months integer,
  total_repayable numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists debts_user_id_idx on public.debts(user_id);
create index if not exists debts_type_idx on public.debts(type);
create index if not exists debts_is_closed_idx on public.debts(is_closed);

drop trigger if exists debts_set_updated_at on public.debts;
create trigger debts_set_updated_at
  before update on public.debts
  for each row execute function public.set_updated_at();

-- ─── reports ─────────────────────────────────────────────────────────────────
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  year smallint not null check (year between 1970 and 9999),
  notes text,
  summary_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month, year)
);

create index if not exists reports_budget_id_idx on public.reports(budget_id);
create index if not exists reports_user_id_idx on public.reports(user_id);

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

-- ─── net_worth_snapshots ─────────────────────────────────────────────────────
create table if not exists public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  total_assets numeric(14,2) not null default 0,
  total_liabilities numeric(14,2) not null default 0,
  net_worth numeric(14,2) not null default 0,
  snapshot_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create index if not exists net_worth_snapshots_user_id_idx on public.net_worth_snapshots(user_id);
create index if not exists net_worth_snapshots_snapshot_date_idx on public.net_worth_snapshots(snapshot_date);

-- ─── activity_logs ───────────────────────────────────────────────────────────
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  category text not null check (category in ('budget','net_worth','goals','debts')),
  title text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_user_id_created_at_idx
  on public.activity_logs(user_id, created_at desc);
create index if not exists activity_logs_category_idx on public.activity_logs(category);

-- ─── push_subscriptions ──────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

-- ─── Auth: auto-create profile on signup ─────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Pattern: each table owned by `user_id` (or `id` for profiles). All four CRUD
-- ops restricted to the row owner. Service role bypasses RLS entirely.

alter table public.profiles enable row level security;
alter table public.budgets enable row level security;
alter table public.categories enable row level security;
alter table public.budget_items enable row level security;
alter table public.asset_categories enable row level security;
alter table public.assets enable row level security;
alter table public.asset_value_history enable row level security;
alter table public.debts enable row level security;
alter table public.reports enable row level security;
alter table public.net_worth_snapshots enable row level security;
alter table public.activity_logs enable row level security;
alter table public.push_subscriptions enable row level security;

-- profiles: own row by id
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);

-- Generic helper to apply CRUD policies on user_id-keyed tables.
do $$
declare
  t text;
  user_id_tables text[] := array[
    'budgets','categories','budget_items','asset_categories','assets',
    'asset_value_history','debts','reports','net_worth_snapshots',
    'activity_logs','push_subscriptions'
  ];
begin
  foreach t in array user_id_tables loop
    execute format('drop policy if exists "%s_select_own" on public.%I', t, t);
    execute format('create policy "%s_select_own" on public.%I for select using (auth.uid() = user_id)', t, t);

    execute format('drop policy if exists "%s_insert_own" on public.%I', t, t);
    execute format('create policy "%s_insert_own" on public.%I for insert with check (auth.uid() = user_id)', t, t);

    execute format('drop policy if exists "%s_update_own" on public.%I', t, t);
    execute format('create policy "%s_update_own" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);

    execute format('drop policy if exists "%s_delete_own" on public.%I', t, t);
    execute format('create policy "%s_delete_own" on public.%I for delete using (auth.uid() = user_id)', t, t);
  end loop;
end;
$$;
