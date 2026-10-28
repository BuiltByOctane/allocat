-- Budget cycle start day.
--
-- A user can start their budget cycle on any day 1..28 (payday) instead of the
-- 1st. `budgets` keeps its (user_id, month, year) identity — `month`/`year` is
-- the label of the cycle — and gains the real date range it covers.
--
--   profiles.budget_start_day     1..28, default 1 (calendar months).
--   budgets.period_start / _end   inclusive dates; existing rows are back-filled
--                                 as calendar months, so nobody's data moves.
--
-- Existing insert paths (`insert({ user_id, month, year, total_budget })`)
-- keep working unchanged: a BEFORE INSERT trigger stamps the range from the
-- owner's start day when none is supplied. The same trigger refuses any insert
-- or re-date that would overlap another of the user's budgets.
--
-- Switching the start day is one RPC (`apply_budget_cycle_switch`) so the
-- profile, deletions and re-dates land atomically.

-- ─── columns ─────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists budget_start_day smallint not null default 1
    check (budget_start_day between 1 and 28);

alter table public.budgets
  add column if not exists period_start date,
  add column if not exists period_end date;

-- Back-fill as calendar months (start day 1 for everyone today).
update public.budgets
set period_start = make_date(year, month, 1),
    period_end   = (make_date(year, month, 1) + interval '1 month' - interval '1 day')::date
where period_start is null or period_end is null;

alter table public.budgets
  alter column period_start set not null,
  alter column period_end   set not null;

alter table public.budgets drop constraint if exists budgets_period_order;
alter table public.budgets
  add constraint budgets_period_order check (period_start <= period_end);

-- ─── period range ────────────────────────────────────────────────────────────
-- The cycle labelled (month, year) starts on day `p_day` of that month and
-- ends the day before the same day of the next month. p_day <= 28 keeps
-- make_date valid in every month.
create or replace function public.budget_period_range(p_month int, p_year int, p_day int)
returns table(start_date date, end_date date)
language sql
immutable
set search_path = public
as $$
  select make_date(p_year, p_month, p_day) as start_date,
         (make_date(p_year, p_month, p_day) + interval '1 month' - interval '1 day')::date as end_date;
$$;

-- ─── stamp + overlap guard ───────────────────────────────────────────────────
-- security invoker: RLS hands an authenticated caller exactly their own
-- profile and budgets, which is all this needs; service-role bypasses RLS.
-- A BEFORE ROW trigger runs before the RLS WITH CHECK, so a row written for
-- someone else's user_id is passed through untouched — RLS then rejects it,
-- and the trigger never leaks whether the victim has a budget in that range.
create or replace function public.budgets_stamp_period()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_day int;
begin
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    return new;
  end if;

  if tg_op = 'INSERT' and new.period_start is null then
    select coalesce(
      (select p.budget_start_day from public.profiles p where p.id = new.user_id),
      1
    ) into v_day;

    select r.start_date, r.end_date
      into new.period_start, new.period_end
      from public.budget_period_range(new.month, new.year, v_day) r;
  end if;

  -- Serialize per user so two concurrent writes can't both pass the check.
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

  if exists (
    select 1
    from public.budgets b
    where b.user_id = new.user_id
      and b.id <> new.id
      and b.period_start <= new.period_end
      and b.period_end   >= new.period_start
  ) then
    raise exception 'budget_period_overlap';
  end if;

  return new;
end;
$$;

drop trigger if exists budgets_stamp_period on public.budgets;
create trigger budgets_stamp_period
  before insert or update of period_start, period_end, month, year on public.budgets
  for each row execute function public.budgets_stamp_period();

-- ─── start-day switch ────────────────────────────────────────────────────────
-- p_plan (built client-side by planStartDaySwitch):
--   { "startDay": 15,
--     "current": { "budgetId": "uuid|null", "month": 10, "year": 2026,
--                  "start": "2026-10-01", "end": "2026-11-14" } | null,
--     "deleteBudgetIds": ["uuid"],
--     "redate": [{ "budgetId": "uuid", "start": "2026-12-15", "end": "2027-01-14" }] }
-- Any other key is ignored.
--
-- Order keeps every intermediate state overlap-free (the trigger checks each
-- row as it is written): profile → deletes (categories / items / reports
-- cascade; sms_transactions & merchant_rules links are set null) → re-dates →
-- current budget. A re-date moving later goes furthest-future first; one moving
-- earlier goes nearest first. If the current budget's range shrinks it is
-- applied before the re-dates instead (the following cycle moves into the
-- room it frees).
--
-- security invoker: RLS applies, and every statement also filters on
-- auth.uid() explicitly.
create or replace function public.apply_budget_cycle_switch(p_plan jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  v_day int;
  v_current jsonb;
  v_cur_id uuid;
  v_cur_end date;
  v_old_end date;
  v_cur_first boolean := false;
  r record;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- One switch (and its trigger checks) per user at a time.
  perform pg_advisory_xact_lock(hashtext(uid::text));

  v_day := (p_plan ->> 'startDay')::int;
  if v_day is null or v_day < 1 or v_day > 28 then
    raise exception 'invalid startDay' using errcode = '22023';
  end if;

  v_current := p_plan -> 'current';
  if v_current is not null and jsonb_typeof(v_current) = 'null' then
    v_current := null;
  end if;

  -- 1. profile
  update public.profiles
  set budget_start_day = v_day
  where id = uid;
  if not found then
    raise exception 'profile_not_found';
  end if;

  -- 2. deletes
  delete from public.budgets
  where user_id = uid
    and id in (
      select (e #>> '{}')::uuid
      from jsonb_array_elements(
        case when jsonb_typeof(p_plan -> 'deleteBudgetIds') = 'array'
             then p_plan -> 'deleteBudgetIds' else '[]'::jsonb end
      ) e
    );

  -- 3a. current budget first when its range shrinks
  if v_current is not null and nullif(v_current ->> 'budgetId', '') is not null then
    v_cur_id  := (v_current ->> 'budgetId')::uuid;
    v_cur_end := (v_current ->> 'end')::date;

    select b.period_end into v_old_end
    from public.budgets b
    where b.id = v_cur_id and b.user_id = uid;

    if v_old_end is not null and v_cur_end < v_old_end then
      v_cur_first := true;
      update public.budgets
      set period_end = v_cur_end
      where id = v_cur_id and user_id = uid;
    end if;
  end if;

  -- 3b. re-dates
  for r in
    select x.id, x.new_start, x.new_end
    from (
      select (e ->> 'budgetId')::uuid as id,
             (e ->> 'start')::date    as new_start,
             (e ->> 'end')::date      as new_end
      from jsonb_array_elements(
        case when jsonb_typeof(p_plan -> 'redate') = 'array'
             then p_plan -> 'redate' else '[]'::jsonb end
      ) e
    ) x
    join public.budgets b on b.id = x.id and b.user_id = uid
    order by
      (x.new_start < b.period_start) desc,                                 -- earlier-movers first
      case when x.new_start < b.period_start then x.new_start end asc,     -- nearest first
      case when x.new_start >= b.period_start then x.new_start end desc    -- furthest first
  loop
    update public.budgets
    set period_start = r.new_start,
        period_end   = r.new_end
    where id = r.id and user_id = uid;
  end loop;

  -- 4. current budget
  if v_current is not null then
    if nullif(v_current ->> 'budgetId', '') is not null then
      if not v_cur_first then
        update public.budgets
        set period_end = (v_current ->> 'end')::date
        where id = (v_current ->> 'budgetId')::uuid and user_id = uid;
      end if;
    else
      insert into public.budgets (user_id, month, year, total_budget, period_start, period_end)
      values (
        uid,
        (v_current ->> 'month')::int,
        (v_current ->> 'year')::int,
        0,
        (v_current ->> 'start')::date,
        (v_current ->> 'end')::date
      );
    end if;
  end if;
end;
$$;

revoke all on function public.apply_budget_cycle_switch(jsonb) from public, anon;
grant execute on function public.apply_budget_cycle_switch(jsonb) to authenticated;

-- ─── probes (run manually after applying; not part of the migration) ─────────
-- Replace <user> with a real auth.users id that has a profile row.
--
-- begin;
--   -- 1. overlapping explicit dates ⇒ ERROR: budget_period_overlap
--   insert into public.budgets (user_id, month, year, total_budget, period_start, period_end)
--   values ('<user>', 1, 2099, 0, '2099-01-01', '2099-01-31');
--   insert into public.budgets (user_id, month, year, total_budget, period_start, period_end)
--   values ('<user>', 2, 2099, 0, '2099-01-15', '2099-02-14');
-- rollback;
--
-- begin;
--   -- 2. null dates + budget_start_day = 15, month 12 year 2026 ⇒ 2026-12-15 / 2027-01-14
--   update public.profiles set budget_start_day = 15 where id = '<user>';
--   insert into public.budgets (user_id, month, year, total_budget)
--   values ('<user>', 12, 2026, 0)
--   returning period_start, period_end;
-- rollback;
--
-- begin;
--   -- 3a. day 15, October re-dated to Oct 1 – Nov 14 (a 1 → 15 switch), then a
--   --     null-dated November: stamped Nov 15 – Dec 14, contiguous ⇒ succeeds.
--   update public.profiles set budget_start_day = 15 where id = '<user>';
--   insert into public.budgets (user_id, month, year, total_budget, period_start, period_end)
--   values ('<user>', 10, 2099, 0, '2099-10-01', '2099-10-31');
--   update public.budgets set period_end = '2099-11-14'
--   where user_id = '<user>' and month = 10 and year = 2099;
--   insert into public.budgets (user_id, month, year, total_budget)
--   values ('<user>', 11, 2099, 0)
--   returning period_start, period_end;          -- 2099-11-15 / 2099-12-14
-- rollback;
--
-- begin;
--   -- 3b. the same with October stretched one day further (Oct 1 – Nov 15):
--   --     the null-dated November (Nov 15 – Dec 14) ⇒ ERROR: budget_period_overlap
--   update public.profiles set budget_start_day = 15 where id = '<user>';
--   insert into public.budgets (user_id, month, year, total_budget, period_start, period_end)
--   values ('<user>', 10, 2099, 0, '2099-10-01', '2099-11-15');
--   insert into public.budgets (user_id, month, year, total_budget)
--   values ('<user>', 11, 2099, 0);
-- rollback;
--
-- begin;
--   -- 3c. a 15 → 1 switch: October stretched to Oct 15 – Nov 30, day 1; a
--   --     null-dated November (Nov 1 – 30) ⇒ ERROR: budget_period_overlap.
--   --     Re-labelling an existing row is re-checked too (month/year in the
--   --     trigger's column list).
--   update public.profiles set budget_start_day = 1 where id = '<user>';
--   insert into public.budgets (user_id, month, year, total_budget, period_start, period_end)
--   values ('<user>', 10, 2099, 0, '2099-10-15', '2099-11-30');
--   insert into public.budgets (user_id, month, year, total_budget)
--   values ('<user>', 11, 2099, 0);
-- rollback;
--
-- -- 4. (I1) run as an authenticated user A (set request.jwt.claims / role
-- --    authenticated), inserting a row with user B's id overlapping one of B's
-- --    budgets ⇒ ERROR: new row violates row-level security policy — NOT
-- --    budget_period_overlap (the trigger passes foreign rows through).
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<userA>","role":"authenticated"}', true);
--   insert into public.budgets (user_id, month, year, total_budget, period_start, period_end)
--   values ('<userB>', 10, 2026, 0, '2026-10-01', '2026-10-31');
-- rollback;
--
-- begin;
--   -- 5. (M4) inverted range ⇒ ERROR: violates check constraint "budgets_period_order"
--   insert into public.budgets (user_id, month, year, total_budget, period_start, period_end)
--   values ('<user>', 1, 2099, 0, '2099-01-31', '2099-01-01');
-- rollback;
