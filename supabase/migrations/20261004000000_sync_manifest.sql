-- Sync manifest: one request answers "did anything change?" for every table.
--
-- A reconcile used to fire two PostgREST calls per table (a delta + an id
-- sweep) on every app open — ~25 requests that almost always came back empty.
-- The client now sends its per-table watermarks here first and pulls only the
-- tables this reports as changed, so a quiet open costs exactly one request.
--
-- Per table it returns:
--   changed — a row exists with updated_at newer than the client's watermark
--             (compared here in timestamptz, so microsecond ties are exact).
--   n       — the user's row count, for tables the client pulls in full. A
--             deletion never bumps updated_at; a count that differs from the
--             local one is how the client knows to run the id sweep.
--
-- security invoker: RLS still applies; the explicit owner filter is only there
-- so the (user_id, updated_at) index from 20260912000000_delta_sync.sql is used.
-- A client on an older build simply never calls this.

create or replace function public.sync_manifest(p_watermarks jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  spec record;
  v_changed boolean;
  v_n bigint;
  result jsonb := '{}'::jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  for spec in
    select * from (values
      ('profiles',            'id',      true),
      ('budgets',             'user_id', true),
      ('categories',          'user_id', true),
      ('budget_items',        'user_id', true),
      ('assets',              'user_id', true),
      ('asset_categories',    'user_id', true),
      ('asset_value_history', 'user_id', false),
      ('debts',               'user_id', true),
      ('reports',             'user_id', true),
      ('net_worth_snapshots', 'user_id', false),
      ('activity_logs',       'user_id', false),
      ('merchant_rules',      'user_id', true),
      ('sms_transactions',    'user_id', false),
      ('sms_blocklist',       'user_id', true),
      ('feedback',            'user_id', false)
    ) as t(tbl, owner_col, counted)
  loop
    execute format(
      'select coalesce(max(updated_at) > $2, false), %s from public.%I where %I = $1',
      case when spec.counted then 'count(*)' else 'null::bigint' end,
      spec.tbl,
      spec.owner_col
    )
    into v_changed, v_n
    using uid, coalesce((p_watermarks ->> spec.tbl)::timestamptz, '-infinity'::timestamptz);

    result := result || jsonb_build_object(
      spec.tbl,
      jsonb_build_object('changed', v_changed, 'n', v_n)
    );
  end loop;

  return result;
end;
$$;

revoke all on function public.sync_manifest(jsonb) from public, anon;
grant execute on function public.sync_manifest(jsonb) to authenticated;
