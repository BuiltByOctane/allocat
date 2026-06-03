-- SMS transaction ingestion + merchant→budget learning rules.
-- Adds two tables that power Android SMS auto-categorization (see lib/actions/sms.ts).
-- Idempotent where practical; mirrors the init migration's conventions.

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

-- ─── merchant_rules ──────────────────────────────────────────────────────────
-- A learned mapping: normalized merchant pattern → the budget item to charge.
-- created first because sms_transactions.matched_rule_id references it.
create table if not exists public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_type text not null check (match_type in ('exact','contains','regex')),
  pattern text not null,
  merchant_normalized text,
  budget_item_id uuid not null references public.budget_items(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  auto_apply boolean not null default true,
  times_applied integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists merchant_rules_user_id_idx on public.merchant_rules(user_id);
create index if not exists merchant_rules_user_match_idx on public.merchant_rules(user_id, match_type);

drop trigger if exists merchant_rules_set_updated_at on public.merchant_rules;
create trigger merchant_rules_set_updated_at
  before update on public.merchant_rules
  for each row execute function public.set_updated_at();

-- ─── sms_transactions ────────────────────────────────────────────────────────
-- Every parsed transaction SMS. dedupe_key drops re-delivered duplicates.
create table if not exists public.sms_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_text text not null,
  sender text,
  amount numeric(14,2),
  currency text,
  merchant_raw text,
  merchant_normalized text,
  direction text check (direction in ('debit','credit')),
  occurred_at timestamptz,
  dedupe_key text not null,
  status text not null default 'pending'
    check (status in ('pending','categorized','ignored','duplicate')),
  matched_rule_id uuid references public.merchant_rules(id) on delete set null,
  budget_item_id uuid references public.budget_items(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists sms_transactions_user_id_idx on public.sms_transactions(user_id);
create index if not exists sms_transactions_user_status_idx on public.sms_transactions(user_id, status);
create index if not exists sms_transactions_occurred_idx on public.sms_transactions(occurred_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.merchant_rules enable row level security;
alter table public.sms_transactions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['merchant_rules','sms_transactions'] loop
    execute format('drop policy if exists "%s_select_own" on public.%I', t, t);
    execute format('create policy "%s_select_own" on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists "%s_insert_own" on public.%I', t, t);
    execute format('create policy "%s_insert_own" on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists "%s_update_own" on public.%I', t, t);
    execute format('create policy "%s_update_own" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists "%s_delete_own" on public.%I', t, t);
    execute format('create policy "%s_delete_own" on public.%I for delete using (auth.uid() = user_id)', t, t);
  end loop;
end $$;
