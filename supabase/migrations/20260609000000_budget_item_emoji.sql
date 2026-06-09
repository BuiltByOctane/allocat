-- Per-item display emoji on budget_items, nullable.
-- Display-only; no backfill needed — the client falls back to the item name's
-- first letter when this is null (components/budget/CategoryDetailPage.tsx).

alter table public.budget_items add column if not exists emoji text;
