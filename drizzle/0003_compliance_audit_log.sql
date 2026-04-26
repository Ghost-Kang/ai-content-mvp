-- Migration 003 — W4-07 follow-up: export overrides + compliance audit
-- Idempotent: safe to re-run.
-- Run: pnpm db:migrate:compliance

-- Optional JSON on workflow_runs — backend/operator can set
-- e.g. {"aiDisclosureLabel":{"disabled":true}} to suppress CAC disclosure in FCPXML.
-- UI does not expose this; only SQL/admin tooling until a dedicated action exists.

ALTER TABLE IF EXISTS workflow_runs
  ADD COLUMN IF NOT EXISTS export_overrides jsonb;

-- Append-only log for high-risk export choices (e.g. disclosure off).
-- Read by /admin/dashboard via service-role DB. RLS: not enabled (same pattern as
-- other ops tables consumed only on the server; anon JWT never connects as superuser).

CREATE TABLE IF NOT EXISTS compliance_audit_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id     uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action     text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_compliance_tenant_time
  ON compliance_audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_run
  ON compliance_audit_logs (run_id);
