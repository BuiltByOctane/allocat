-- Transactions unify + feedback + debt-reminder index.
--
-- 1. Generalize sms_transactions into the canonical transaction store: add a
--    `source` column ('sms' | 'manual') so manual budget spends become real
--    transaction rows too, and `original_amount` to preserve the parsed SMS
--    amount when the user overrides the recorded spend during allocation.
-- 2. New `feedback` table for in-app bug reports / feature requests / feedback.
-- 3. Index debts(user_id, expected_payoff_date) for the local due-date reminder
--    scan (lib/native/debtReminders.ts).
-- Idempotent; mirrors the sms_blocklist / merchant_rules migration conventions.

-- ─── sms_transactions: source + original_amount ──────────────────────────────
alter table public.sms_transactions
  add column if not exists source text not null default 'sms',
  add column if not exists original_amount numeric;

alter table public.sms_transactions
  drop constraint if exists sms_transactions_source_check;
alter table public.sms_transactions
  add constraint sms_transactions_source_check
  check (source in ('sms', 'manual'));

create index if not exists sms_transactions_budget_item_idx
  on public.sms_transactions(user_id, budget_item_id);

-- ─── debts: due-date reminder scan index ─────────────────────────────────────
create index if not exists debts_due_date_idx
  on public.debts(user_id, expected_payoff_date);

-- ─── feedback ────────────────────────────────────────────────────────────────
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'feedback',
  message text not null,
  app_version text,
  platform text,
  created_at timestamptz not null default now()
);

alter table public.feedback
  drop constraint if exists feedback_kind_check;
alter table public.feedback
  add constraint feedback_kind_check
  check (kind in ('bug', 'feature', 'feedback'));

create index if not exists feedback_user_id_idx on public.feedback(user_id);
create index if not exists feedback_created_idx on public.feedback(user_id, created_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.feedback enable row level security;

do $$
declare t text;
begin
  foreach t in array array['feedback'] loop
    execute format('drop policy if exists "%s_select_own" on public.%I', t, t);
    execute format('create policy "%s_select_own" on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists "%s_insert_own" on public.%I', t, t);
    execute format('create policy "%s_insert_own" on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists "%s_delete_own" on public.%I', t, t);
    execute format('create policy "%s_delete_own" on public.%I for delete using (auth.uid() = user_id)', t, t);
  end loop;
end $$;
