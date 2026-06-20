-- SMS "report wrong SMS" blocklist.
-- Records the SMS *template* (a one-way hashed template_key, NOT the merchant or
-- the raw body) that a user reported as wrongly captured, so future SMS matching
-- the same template are skipped at ingest time (see lib/sms/ingestClient.ts +
-- lib/actions/sms.ts reportSmsMistake). Idempotent; mirrors the sms_transactions
-- / merchant_rules migration conventions.

-- ─── sms_blocklist ───────────────────────────────────────────────────────────
create table if not exists public.sms_blocklist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_key text not null,
  sample_label text,
  created_at timestamptz not null default now(),
  unique (user_id, template_key)
);

create index if not exists sms_blocklist_user_id_idx on public.sms_blocklist(user_id);
create index if not exists sms_blocklist_template_idx on public.sms_blocklist(user_id, template_key);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.sms_blocklist enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sms_blocklist'] loop
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
