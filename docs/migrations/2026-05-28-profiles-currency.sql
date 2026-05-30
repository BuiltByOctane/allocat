-- Add display-currency preference to profiles.
-- Stored amounts are unchanged; this only affects how numbers are formatted in the UI.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';

-- Optional sanity: restrict to known ISO codes the app supports.
-- ALTER TABLE profiles
--   ADD CONSTRAINT profiles_currency_valid
--   CHECK (currency IN ('INR','USD','EUR','GBP','JPY','CNY','AUD','CAD','CHF','SGD','AED','SAR','HKD','NZD','ZAR'));
