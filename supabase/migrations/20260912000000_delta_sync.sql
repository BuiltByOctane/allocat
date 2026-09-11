-- Delta sync groundwork.
--
-- Every reconcile used to re-download every row of every table because the
-- payload itself was the only way to know what changed (and the only way to
-- detect deletions). This gives the client a per-table watermark to pull
-- against: `updated_at`, maintained by a BEFORE UPDATE trigger so EVERY writer
-- is covered — server actions, the service role, and manual SQL alike.
--
-- Additive only: no column is dropped or retyped, so a client from before this
-- migration keeps working (it simply ignores the column).

-- ─── Helper (idempotent — mirrors 20260101000000_init.sql) ───────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Tables that had no updated_at at all ────────────────────────────────────
-- Added nullable first, backfilled from created_at, THEN defaulted + set not
-- null: `default now()` is volatile, and adding it in one step would rewrite
-- the whole table (activity_logs is the large one).
do $$
declare
  t text;
begin
  foreach t in array array[
    'asset_categories',
    'asset_value_history',
    'net_worth_snapshots',
    'activity_logs',
    'sms_transactions',
    'sms_blocklist',
    'feedback'
  ]
  loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz', t);
    execute format('update public.%I set updated_at = coalesce(created_at, now()) where updated_at is null', t);
    execute format('alter table public.%I alter column updated_at set default now()', t);
    execute format('alter table public.%I alter column updated_at set not null', t);

    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;

-- ─── Watermark indexes ───────────────────────────────────────────────────────
-- The delta pull is `where user_id = $1 and updated_at >= $2`, so every
-- user-scoped table wants this composite. `profiles` is excluded: it is one row
-- per user, reached by primary key.
do $$
declare
  t text;
begin
  foreach t in array array[
    'budgets',
    'categories',
    'budget_items',
    'assets',
    'asset_categories',
    'asset_value_history',
    'debts',
    'reports',
    'net_worth_snapshots',
    'activity_logs',
    'merchant_rules',
    'sms_transactions',
    'sms_blocklist',
    'feedback'
  ]
  loop
    execute format(
      'create index if not exists %I on public.%I(user_id, updated_at)',
      t || '_user_updated_idx', t
    );
  end loop;
end;
$$;
