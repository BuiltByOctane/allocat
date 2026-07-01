-- Per-item, per-month overspend tally that drives escalating notification tiers.
-- Auto-resets monthly because budget_items get fresh UUIDs each month.
ALTER TABLE budget_items
  ADD COLUMN overspend_count integer NOT NULL DEFAULT 0;
