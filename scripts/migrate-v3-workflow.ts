// W1-01-V3: Create v3.0 workflow engine tables.
// Idempotent — safe to re-run.
//
// Tables: workflow_runs, workflow_steps, topic_pushes, monthly_usage
// Enums:  node_type, workflow_status, step_status
// RLS:    4 tenant_isolation policies
//
// Run: pnpm db:migrate:v3
// Or:  pnpm tsx --env-file=.env.local scripts/migrate-v3-workflow.ts

import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');

  const sql = postgres(url, { max: 1 });
  try {
    console.log('--- Migration 002 — v3.0 workflow engine ---');

    // ─── Enums ────────────────────────────────────────────────────────────────
    await sql`
      DO $$ BEGIN
        CREATE TYPE node_type AS ENUM ('topic', 'script', 'storyboard', 'video', 'export');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `;
    await sql`
      DO $$ BEGIN
        CREATE TYPE workflow_status AS ENUM ('pending', 'running', 'done', 'failed', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `;
    await sql`
      DO $$ BEGIN
        CREATE TYPE step_status AS ENUM ('pending', 'running', 'done', 'failed', 'skipped', 'dirty');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `;
    console.log('  ✓ enums created (node_type, workflow_status, step_status)');

    // ─── workflow_runs ────────────────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id         uuid NOT NULL REFERENCES tenants(id),
        created_by        uuid NOT NULL REFERENCES users(id),
        topic             text NOT NULL,
        status            workflow_status NOT NULL DEFAULT 'pending',
        total_cost_fen    integer NOT NULL DEFAULT 0,
        total_video_count integer NOT NULL DEFAULT 0,
        error_msg         text,
        started_at        timestamptz,
        completed_at      timestamptz,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_runs_tenant ON workflow_runs(tenant_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_runs_status ON workflow_runs(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_runs_created_by ON workflow_runs(created_by)`;
    await sql`ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY`;
    await sql`
      DO $$ BEGIN
        CREATE POLICY workflow_runs_tenant_isolation ON workflow_runs
          USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `;
    console.log('  ✓ workflow_runs table + 3 indexes + RLS policy');

    // ─── workflow_steps ───────────────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS workflow_steps (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id       uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
        tenant_id    uuid NOT NULL REFERENCES tenants(id),
        node_type    node_type NOT NULL,
        step_index   integer NOT NULL,
        status       step_status NOT NULL DEFAULT 'pending',
        input_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
        output_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
        error_msg    text,
        retry_count  integer NOT NULL DEFAULT 0,
        cost_fen     integer NOT NULL DEFAULT 0,
        started_at   timestamptz,
        completed_at timestamptz,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_steps_run ON workflow_steps(run_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_steps_run_index ON workflow_steps(run_id, step_index)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_steps_node_status ON workflow_steps(node_type, status)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_steps_run_node ON workflow_steps(run_id, node_type)`;
    await sql`ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY`;
    await sql`
      DO $$ BEGIN
        CREATE POLICY workflow_steps_tenant_isolation ON workflow_steps
          USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `;
    console.log('  ✓ workflow_steps table + 4 indexes + RLS policy');

    // ─── topic_pushes ─────────────────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS topic_pushes (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           uuid NOT NULL REFERENCES tenants(id),
        user_id             uuid NOT NULL REFERENCES users(id),
        push_date           text NOT NULL,
        source              text NOT NULL,
        topics_json         jsonb NOT NULL DEFAULT '[]'::jsonb,
        opened_at           timestamptz,
        clicked_topic_index integer,
        used_in_run_id      uuid REFERENCES workflow_runs(id),
        created_at          timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_topic_pushes_tenant ON topic_pushes(tenant_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_topic_pushes_user_date ON topic_pushes(user_id, push_date)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_topic_pushes_user_date ON topic_pushes(user_id, push_date)`;
    await sql`ALTER TABLE topic_pushes ENABLE ROW LEVEL SECURITY`;
    await sql`
      DO $$ BEGIN
        CREATE POLICY topic_pushes_tenant_isolation ON topic_pushes
          USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `;
    console.log('  ✓ topic_pushes table + 3 indexes + RLS policy');

    // ─── monthly_usage ────────────────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS monthly_usage (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id          uuid NOT NULL REFERENCES tenants(id),
        user_id            uuid NOT NULL REFERENCES users(id),
        month_key          text NOT NULL,
        video_count        integer NOT NULL DEFAULT 0,
        workflow_run_count integer NOT NULL DEFAULT 0,
        total_cost_fen     integer NOT NULL DEFAULT 0,
        last_updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_monthly_usage_tenant_month ON monthly_usage(tenant_id, month_key)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_usage_user_month ON monthly_usage(user_id, month_key)`;
    await sql`ALTER TABLE monthly_usage ENABLE ROW LEVEL SECURITY`;
    await sql`
      DO $$ BEGIN
        CREATE POLICY monthly_usage_tenant_isolation ON monthly_usage
          USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `;
    console.log('  ✓ monthly_usage table + 2 indexes + RLS policy');

    // ─── updated_at trigger ───────────────────────────────────────────────────
    await sql`
      CREATE OR REPLACE FUNCTION trg_set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;
    await sql`DROP TRIGGER IF EXISTS workflow_runs_updated_at ON workflow_runs`;
    await sql`
      CREATE TRIGGER workflow_runs_updated_at
        BEFORE UPDATE ON workflow_runs
        FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at()
    `;
    await sql`DROP TRIGGER IF EXISTS workflow_steps_updated_at ON workflow_steps`;
    await sql`
      CREATE TRIGGER workflow_steps_updated_at
        BEFORE UPDATE ON workflow_steps
        FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at()
    `;
    console.log('  ✓ updated_at triggers (workflow_runs + workflow_steps)');

    console.log('\n✅ Migration 002 complete (idempotent).');
  } finally {
    await sql.end();
  }
}

main().catch((e) => { console.error('❌ Migration failed:', e); process.exit(1); });
