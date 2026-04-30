-- 0004_rls_app_role.sql
-- Audit #1 (2026-04-30) — Create the non-superuser `app_user` role and grant
-- the minimum table privileges so RLS policies actually enforce.
--
-- Idempotent: safe to re-run.
--
-- IMPORTANT: this migration only PREPARES the role. It does NOT switch
-- DATABASE_URL to use it. See docs/RLS-CUTOVER.md for the full switchover
-- sequence (test in staging, run probe-cross-tenant.ts, then flip env).

-- ─── 1. Create the role (idempotent) ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    -- LOGIN required for connection-string usage. NOBYPASSRLS is the
    -- whole point — RLS policies enforce against this role.
    CREATE ROLE app_user WITH LOGIN NOBYPASSRLS PASSWORD :'app_user_password';
  END IF;
END $$;

-- ─── 2. Grant schema usage ───────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO app_user;

-- ─── 3. Grant table-level CRUD on existing + future tables ───────────────────
-- We grant SELECT/INSERT/UPDATE/DELETE on all current tables and set
-- default privileges so newly-created tables inherit the same grants.
-- DDL (CREATE/ALTER/DROP) stays with the migration role only.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO app_user;

-- ─── 4. Sanity: make sure `app.tenant_id` is allowed as a session var ───────
-- Postgres allows arbitrary `app.*` GUCs without explicit setup, but on
-- some Supabase tiers the `pg_settings` denies unknown settings unless
-- you ALTER SYSTEM. Skip here — Supabase's default config accepts custom
-- namespaced GUCs out of the box; if the staging probe fails we escalate
-- to ops to enable.
COMMENT ON ROLE app_user IS
  'RLS-enforced application role. Connection string set in DATABASE_URL_APP. ' ||
  'Every transaction must SET LOCAL app.tenant_id = ''<uuid>'' before any ' ||
  'tenant-scoped query. See docs/RLS-CUTOVER.md.';
