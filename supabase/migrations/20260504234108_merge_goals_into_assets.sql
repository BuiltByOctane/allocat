-- Merge `goals` into `assets`. A goal is just an asset with a target.
-- Run AFTER 20260504213254_cross_section_links.sql.

-- 1. Extend assets with goal fields
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS is_goal BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS achieved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS assets_is_goal_idx
  ON assets (user_id, is_goal)
  WHERE is_goal = true;

-- 2. Auto-create a "Goals" asset_category per user that has goals
INSERT INTO asset_categories (user_id, name, icon)
SELECT DISTINCT g.user_id, 'Goals', '🎯'
FROM goals g
WHERE NOT EXISTS (
  SELECT 1 FROM asset_categories ac
  WHERE ac.user_id = g.user_id AND ac.name = 'Goals'
);

-- 3. Migrate goals → assets, capture mapping
CREATE TEMP TABLE goal_to_asset_map (goal_id UUID PRIMARY KEY, asset_id UUID NOT NULL);

WITH inserted AS (
  INSERT INTO assets (
    user_id, name, icon, category, category_id, value, invested_amount,
    is_goal, target_amount, created_at, updated_at
  )
  SELECT
    g.user_id,
    g.name,
    g.icon,
    'other',
    (SELECT id FROM asset_categories ac WHERE ac.user_id = g.user_id AND ac.name = 'Goals' LIMIT 1),
    g.current_amount,
    g.current_amount,
    true,
    g.target_amount,
    g.created_at,
    g.updated_at
  FROM goals g
  RETURNING id, user_id, name, created_at
)
INSERT INTO goal_to_asset_map (goal_id, asset_id)
SELECT g.id, i.id
FROM goals g
JOIN inserted i
  ON i.user_id = g.user_id
 AND i.name = g.name
 AND i.created_at = g.created_at;

-- 4. Seed initial asset_value_history entry for each migrated asset
INSERT INTO asset_value_history (asset_id, user_id, entry_type, amount, running_total, entry_date)
SELECT m.asset_id, g.user_id, 'initial', g.current_amount, g.current_amount, CURRENT_DATE
FROM goal_to_asset_map m
JOIN goals g ON g.id = m.goal_id;

-- 5. Rewrite budget_items.link_type='goal' rows to point at the new asset
UPDATE budget_items bi
SET link_type = 'asset',
    link_id = m.asset_id
FROM goal_to_asset_map m
WHERE bi.link_type = 'goal' AND bi.link_id = m.goal_id;

-- 6. Drop dead goal binding column (it referenced goals.id, now defunct)
ALTER TABLE goals DROP COLUMN IF EXISTS linked_asset_id;

-- 7. Drop the asset-delete trigger that previously cleared goals.linked_asset_id
DROP TRIGGER IF EXISTS trg_clear_links_on_goal_delete ON goals;

-- 8. Drop goals table
DROP TABLE goals;

-- 9. Tighten budget_items link_type CHECK to remove 'goal'
ALTER TABLE budget_items DROP CONSTRAINT IF EXISTS budget_items_link_type_check;
ALTER TABLE budget_items
  ADD CONSTRAINT budget_items_link_type_check
  CHECK (link_type IS NULL OR link_type IN ('asset', 'debt'));
