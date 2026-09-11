-- Admin portal: paginated + sortable user search.
--
-- The original admin_user_search returned at most 100 rows ordered by
-- created_at desc, with no way to page past them or sort by anything else.
-- This replaces it with an offset-paged, whitelisted-sort version that also
-- reports the unpaged total so the UI can render "x–y of n" and page controls.
--
-- Return type changes (setof row -> jsonb), so the old signature must go first;
-- `create or replace` cannot change a function's return type. Dropping both the
-- 2-arg and 5-arg forms also keeps re-runs idempotent.

drop function if exists public.admin_user_search(text, int);
drop function if exists public.admin_user_search(text, int, int, text, text);

create function public.admin_user_search(
  p_q      text,
  p_limit  int  default 30,
  p_offset int  default 0,
  p_sort   text default 'created_at',
  p_dir    text default 'desc'
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $fn$
declare
  v_sort  text;
  v_dir   text;
  v_limit int := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_off   int := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_rows  jsonb;
begin
  -- Whitelist, never interpolate: p_sort/p_dir reach format() as literals below.
  v_sort := case lower(coalesce(p_sort, 'created_at'))
              when 'email'         then 'p.email'
              when 'full_name'     then 'p.full_name'
              when 'last_seen_at'  then 'p.last_seen_at'
              when 'last_app_mode' then 'p.last_app_mode'
              when 'is_supporter'  then 'p.is_supporter'
              when 'is_onboarded'  then 'p.is_onboarded'
              when 'currency'      then 'p.currency'
              else 'p.created_at'
            end;
  v_dir := case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end;

  select count(*) into v_total
  from profiles p
  where coalesce(nullif(trim(p_q), ''), '') = ''
     or p.email ilike '%' || trim(p_q) || '%'
     or p.full_name ilike '%' || trim(p_q) || '%'
     or p.id::text = trim(p_q);

  -- row_number + `order by t.rn` in the aggregate: jsonb_agg does not inherit a
  -- subquery's ORDER BY, so the page would come back in arbitrary order.
  execute format($q$
    select coalesce(jsonb_agg(to_jsonb(t) - 'rn' order by t.rn), '[]'::jsonb)
    from (
      select p.id, p.email, p.full_name, p.is_onboarded, p.is_supporter,
             p.last_app_mode, p.currency, p.created_at, p.last_seen_at,
             row_number() over (order by %1$s %2$s nulls last, p.id asc) as rn
      from profiles p
      where coalesce(nullif(trim($1), ''), '') = ''
         or p.email ilike '%%' || trim($1) || '%%'
         or p.full_name ilike '%%' || trim($1) || '%%'
         or p.id::text = trim($1)
      order by %1$s %2$s nulls last, p.id asc
      limit $2 offset $3
    ) t
  $q$, v_sort, v_dir)
  into v_rows
  using p_q, v_limit, v_off;

  return jsonb_build_object('rows', coalesce(v_rows, '[]'::jsonb), 'total', v_total);
end;
$fn$;

revoke all on function public.admin_user_search(text, int, int, text, text)
  from public, anon, authenticated;
