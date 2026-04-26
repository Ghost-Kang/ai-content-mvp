// 003: workflow_runs.export_overrides + compliance_audit_logs
// Idempotent. Run: pnpm db:migrate:compliance
// SQL mirror: drizzle/0003_compliance_audit_log.sql

import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');

  const sql = postgres(url, { max: 1, prepare: false });
  try {
    console.log('--- Migration 003 — export_overrides + compliance_audit_logs ---');
    await sql`ALTER TABLE IF EXISTS workflow_runs ADD COLUMN IF NOT EXISTS export_overrides jsonb`;
    await sql`
      CREATE TABLE IF NOT EXISTS compliance_audit_logs (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        run_id     uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
        user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action     text NOT NULL,
        detail     jsonb NOT NULL DEFAULT '{}'
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_compliance_tenant_time
        ON compliance_audit_logs (tenant_id, created_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_compliance_run
        ON compliance_audit_logs (run_id)
    `;
    console.log('✓ 003 complete');
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
