-- Cross-section integration: link budget_items to assets/goals/debts,
-- and bind goals to a single tracked asset.
--
-- Run on Supabase before deploying client schema bump.

ALTER TABLE budget_items
  ADD COLUMN IF NOT EXISTS link_type TEXT
    CHECK (link_type IN ('asset', 'goal', 'debt')),
  ADD COLUMN IF NOT EXISTS link_id UUID;

CREATE INDEX IF NOT EXISTS budget_items_link_idx
  ON budget_items (link_type, link_id)

ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS linked_asset_id UUID
    REFERENCES assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS goals_linked_asset_idx
  ON goals (linked_asset_id);

-- When an asset/goal/debt is deleted, clear references in budget_items
-- (target table varies, so we use triggers rather than a single FK).

CREATE OR REPLACE FUNCTION clear_budget_item_links_for_target()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE budget_items
     SET link_type = NULL,
         link_id = NULL
   WHERE link_id = OLD.id
     AND link_type = TG_ARGV[0]
     AND user_id = OLD.user_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clear_links_on_asset_delete ON assets;
CREATE TRIGGER trg_clear_links_on_asset_delete
  AFTER DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION clear_budget_item_links_for_target('asset');

DROP TRIGGER IF EXISTS trg_clear_links_on_goal_delete ON goals;
CREATE TRIGGER trg_clear_links_on_goal_delete
  AFTER DELETE ON goals
  FOR EACH ROW
  EXECUTE FUNCTION clear_budget_item_links_for_target('goal');

DROP TRIGGER IF EXISTS trg_clear_links_on_debt_delete ON debts;
CREATE TRIGGER trg_clear_links_on_debt_delete
  AFTER DELETE ON debts
  FOR EACH ROW
  EXECUTE FUNCTION clear_budget_item_links_for_target('debt');
