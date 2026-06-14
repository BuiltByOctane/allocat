-- Subscription + free-trial state on profiles.
-- Single source of truth for entitlement: derived client- and server-side by
-- lib/subscription/entitlement.ts. A native purchase (Adapty/Play) updates these
-- via webhook; the web app only reads them.
--
-- subscription_status:
--   NULL     → never started a trial, never paid (free tier)
--   'trial'  → inside the 40-day free trial (premium until trial_ends_at)
--   'active' → paid subscriber (premium until subscription_expires_at, if set)
--   'expired'→ trial or subscription lapsed (free tier)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_status     TEXT,
  ADD COLUMN IF NOT EXISTS trial_started_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan                    TEXT,
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_device_id         TEXT;

-- Optional integrity guards (enable once values are confirmed stable):
-- ALTER TABLE profiles
--   ADD CONSTRAINT profiles_subscription_status_valid
--   CHECK (subscription_status IS NULL OR subscription_status IN ('trial','active','expired'));
-- ALTER TABLE profiles
--   ADD CONSTRAINT profiles_plan_valid
--   CHECK (plan IS NULL OR plan IN ('monthly','yearly'));
