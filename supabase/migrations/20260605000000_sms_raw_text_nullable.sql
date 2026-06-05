-- Privacy / Play "SMS-based money management" data minimization.
-- The raw SMS body and sender now stay on-device; only extracted transaction
-- fields + a hashed dedupe_key are synced. Make raw_text nullable and purge any
-- previously-stored raw SMS content from existing rows.

alter table public.sms_transactions
  alter column raw_text drop not null;

update public.sms_transactions
  set raw_text = null,
      sender = null
  where raw_text is not null
     or sender is not null;
