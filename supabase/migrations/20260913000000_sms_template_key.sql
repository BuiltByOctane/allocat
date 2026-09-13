-- Persist the SMS template signature on the transaction row.
--
-- "Not a transaction" (sms_blocklist) used to recompute the template key from
-- the local row's raw_text/sender at report time — but those fields are
-- device-only and are overwritten the moment the INSERT syncs (the server row
-- carries neither), so every report after the first flush hashed an empty
-- string and produced the same useless key. Storing the key at ingest (it is
-- already computed on-device and already sent in the ingest payload, and is a
-- one-way hash — no raw SMS content) makes the report exact and keeps the
-- privacy posture unchanged.
alter table public.sms_transactions
  add column if not exists template_key text;
