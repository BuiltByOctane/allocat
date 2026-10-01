-- Wrap auth.uid() in a scalar subquery so Postgres evaluates it once per
-- statement (InitPlan) instead of once per row. Same policy semantics,
-- materially faster on the large per-user tables (budget_items,
-- sms_transactions, activity_logs).
-- Ref: Supabase "RLS performance" guide.

-- profiles is keyed by id, not user_id.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check ((select auth.uid()) = id);

do $$
declare
  t text;
  full_crud text[] := array[
    'budgets','categories','budget_items','asset_categories','assets',
    'asset_value_history','debts','reports','net_worth_snapshots',
    'activity_logs','push_subscriptions','merchant_rules','sms_transactions',
    'sms_blocklist','budget_templates'
  ];
begin
  foreach t in array full_crud loop
    execute format('drop policy if exists "%s_select_own" on public.%I', t, t);
    execute format('create policy "%s_select_own" on public.%I for select using ((select auth.uid()) = user_id)', t, t);
    execute format('drop policy if exists "%s_insert_own" on public.%I', t, t);
    execute format('create policy "%s_insert_own" on public.%I for insert with check ((select auth.uid()) = user_id)', t, t);
    execute format('drop policy if exists "%s_update_own" on public.%I', t, t);
    execute format('create policy "%s_update_own" on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t, t);
    execute format('drop policy if exists "%s_delete_own" on public.%I', t, t);
    execute format('create policy "%s_delete_own" on public.%I for delete using ((select auth.uid()) = user_id)', t, t);
  end loop;
end $$;

-- feedback deliberately has no UPDATE policy (users can't edit sent feedback).
drop policy if exists "feedback_select_own" on public.feedback;
create policy "feedback_select_own" on public.feedback
  for select using ((select auth.uid()) = user_id);
drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own" on public.feedback
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "feedback_delete_own" on public.feedback;
create policy "feedback_delete_own" on public.feedback
  for delete using ((select auth.uid()) = user_id);

-- fcm_tokens and user_active_days landed after this migration was first written
-- and do not follow the "%s_<op>_own" naming convention, so the loop above
-- cannot reach them. Both are write-only to the user (no SELECT policy by
-- design — one user must never enumerate another's devices or activity).
drop policy if exists "own fcm token insert" on public.fcm_tokens;
create policy "own fcm token insert"
  on public.fcm_tokens for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "own fcm token update" on public.fcm_tokens;
create policy "own fcm token update"
  on public.fcm_tokens for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own fcm token delete" on public.fcm_tokens;
create policy "own fcm token delete"
  on public.fcm_tokens for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "own active day insert" on public.user_active_days;
create policy "own active day insert"
  on public.user_active_days for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
