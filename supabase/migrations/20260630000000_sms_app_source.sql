-- Derived UPI / payment-app label on sms_transactions, nullable.
-- Computed on-device from the SMS sender id (lib/sms/appSource.ts) — the raw
-- sender never leaves the device; only this short canonical label (e.g. "gpay",
-- "phonepe") is synced. Display-only; no backfill needed (the client renders no
-- badge when null).

alter table public.sms_transactions add column if not exists app_source text;
