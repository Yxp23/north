-- North: let the SECRET key (the `service_role` Postgres role) use the tables.
--
-- Why this file exists: since Supabase's 2026 change, NEW tables in the public schema are no longer
-- granted to the API roles automatically (https://supabase.com/changelog/45329). Without these
-- grants the app fails with "permission denied for table users", even with a valid secret key.
--
-- How to apply: SQL Editor > New query > paste > Run. Safe to run more than once.
--
-- Only service_role gets access. anon and authenticated (the publishable key) get nothing:
-- the first migration already revoked them, and Row Level Security is on with no policies.
grant usage on schema public to service_role;

grant select, insert, update, delete
  on table public.users, public.rules, public.purchases, public.audit_log, public.webhook_events
  to service_role;

-- audit_log.id is an identity column; inserting a row needs its counter.
grant usage, select on sequence public.audit_log_id_seq to service_role;
