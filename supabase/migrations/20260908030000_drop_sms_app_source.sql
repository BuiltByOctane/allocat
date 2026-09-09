-- Drop sms_transactions.app_source. The derived UPI/payment-app label proved
-- unreliable (bank SMS rarely names the app), so the feature was removed from
-- the client and the admin feature-usage RPC. Run 20260908000000_admin_portal
-- (which no longer aggregates it) before or with this.
alter table public.sms_transactions drop column if exists app_source;
