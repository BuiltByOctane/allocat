-- Optional human-readable name for an SMS transaction, nullable.
-- Display-only; overrides merchant_raw in the SMS Allocated list. Set when a
-- user names a txn during allocate / rename. No backfill needed — null falls
-- back to merchant_raw (components/sms/SmsPage.tsx).

alter table public.sms_transactions add column if not exists label text;
