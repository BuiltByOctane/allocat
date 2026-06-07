-- Per-entity display color (palette key "cat-1".."cat-8"), nullable.
-- Display-only; no backfill needed — the client derives a deterministic
-- fallback color from the row id when this is null (lib/theme/dataViz.ts).

alter table public.categories       add column if not exists color text;
alter table public.assets           add column if not exists color text;
alter table public.debts            add column if not exists color text;
alter table public.asset_categories add column if not exists color text;