-- Durable cross-month SMS auto-allocation.
--
-- A merchant_rule used to bind to a specific budget_items.id. Because every month
-- a template is applied creates brand-new budget_items with fresh UUIDs, that
-- binding broke across months (logged to the wrong month's item, or threw
-- "Item not found"). We re-key rules to a durable identity — the (template_id,
-- template_item_id) the item came from — and resolve it to the current month's
-- item at apply time (see lib/sms/resolveRuleItem.ts). budget_item_id becomes a
-- nullable denormalized cache, not the key.

-- ─── budgets: which template this month was built from (null = manual budget) ──
alter table public.budgets add column if not exists template_id text;
create index if not exists budgets_user_template_idx
  on public.budgets(user_id, template_id);

-- ─── budget_items: durable template identity stamped at setup time ────────────
alter table public.budget_items add column if not exists template_id text;
alter table public.budget_items add column if not exists template_item_id text;
create index if not exists budget_items_template_item_idx
  on public.budget_items(user_id, template_id, template_item_id);

-- ─── merchant_rules: re-key to the durable identity ──────────────────────────
alter table public.merchant_rules add column if not exists template_id text;
alter table public.merchant_rules add column if not exists template_item_id text;

-- Relax the FKs so recreating/deleting an item no longer CASCADE-deletes the
-- rule; demote both id columns to nullable caches.
alter table public.merchant_rules
  drop constraint if exists merchant_rules_budget_item_id_fkey;
alter table public.merchant_rules
  alter column budget_item_id drop not null;
alter table public.merchant_rules
  add constraint merchant_rules_budget_item_id_fkey
    foreign key (budget_item_id) references public.budget_items(id) on delete set null;

alter table public.merchant_rules
  drop constraint if exists merchant_rules_category_id_fkey;
alter table public.merchant_rules
  alter column category_id drop not null;
alter table public.merchant_rules
  add constraint merchant_rules_category_id_fkey
    foreign key (category_id) references public.categories(id) on delete set null;

create index if not exists merchant_rules_template_item_idx
  on public.merchant_rules(user_id, template_id, template_item_id);

-- ─── Backfill: stamp existing template JSONB items with a stable templateItemId.
-- This lets EXISTING custom templates start stamping budget_items on their next
-- apply. Items that already carry a templateItemId are left untouched.
do $$
declare
  tpl record;
  new_cats jsonb;
  cat jsonb;
  itm jsonb;
  new_items jsonb;
begin
  for tpl in select id, categories from public.budget_templates loop
    new_cats := '[]'::jsonb;
    for cat in
      select value from jsonb_array_elements(coalesce(tpl.categories, '[]'::jsonb))
    loop
      new_items := '[]'::jsonb;
      for itm in
        select value from jsonb_array_elements(coalesce(cat->'items', '[]'::jsonb))
      loop
        if nullif(itm->>'templateItemId', '') is null then
          itm := itm || jsonb_build_object('templateItemId', gen_random_uuid()::text);
        end if;
        new_items := new_items || itm;
      end loop;
      new_cats := new_cats || (cat || jsonb_build_object('items', new_items));
    end loop;
    update public.budget_templates set categories = new_cats where id = tpl.id;
  end loop;
end $$;

-- NOTE: existing merchant_rules and existing budget_items are intentionally NOT
-- back-stamped. Matching historical items to a template by name is ambiguous and
-- risks mis-charging, and a back-stamped rule is useless until the *current*
-- budget is also stamped (which only happens on the next template apply).
-- Instead, resolveRuleItemId() keeps legacy rules (template_id IS NULL) working
-- with their existing same-month behaviour; the first re-allocation after this
-- migration mints a fresh durable rule. One re-allocation, then permanent.
