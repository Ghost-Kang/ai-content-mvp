-- Migration 002 — v3.0 Workflow Engine
-- Tables: workflow_runs, workflow_steps, topic_pushes, monthly_usage
-- Idempotent: safe to re-run. RLS policies use app.tenant_id session var.
--
-- Canonical SQL reference. Actual execution happens via:
--   pnpm db:migrate:v3   (runs scripts/migrate-v3-workflow.ts)

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE node_type AS ENUM ('topic', 'script', 'storyboard', 'video', 'export');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE workflow_status AS ENUM ('pending', 'running', 'done', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE step_status AS ENUM ('pending', 'running', 'done', 'failed', 'skipped', 'dirty');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Workflow Runs ────────────────────────────────────────────────────────────
-- One row per user-initiated workflow execution.

CREATE TABLE IF NOT EXISTS workflow_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  created_by        UUID NOT NULL REFERENCES users(id),
  topic             TEXT NOT NULL,
  status            workflow_status NOT NULL DEFAULT 'pending',
  total_cost_fen    INTEGER NOT NULL DEFAULT 0,    -- 分 = 0.01 元
  total_video_count INTEGER NOT NULL DEFAULT 0,
  error_msg         TEXT,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runs_tenant ON workflow_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created_by ON workflow_runs(created_by);

ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY workflow_runs_tenant_isolation ON workflow_runs
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Workflow Steps ───────────────────────────────────────────────────────────
-- One row per node execution within a run. tenant_id denormalized for RLS perf.

CREATE TABLE IF NOT EXISTS workflow_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  node_type    node_type NOT NULL,
  step_index   INTEGER NOT NULL,                -- 0..4 for the 5-node pipeline
  status       step_status NOT NULL DEFAULT 'pending',
  input_json   JSONB NOT NULL DEFAULT '{}',
  output_json  JSONB NOT NULL DEFAULT '{}',
  error_msg    TEXT,
  retry_count  INTEGER NOT NULL DEFAULT 0,
  cost_fen     INTEGER NOT NULL DEFAULT 0,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_steps_run ON workflow_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_steps_run_index ON workflow_steps(run_id, step_index);
CREATE INDEX IF NOT EXISTS idx_steps_node_status ON workflow_steps(node_type, status);

-- One step per (run, node_type) — re-runs use retry_count, not new rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_steps_run_node
  ON workflow_steps(run_id, node_type);

ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY workflow_steps_tenant_isolation ON workflow_steps
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Topic Pushes ─────────────────────────────────────────────────────────────
-- Daily trending topics pushed to each user. push_date as YYYY-MM-DD text for
-- timezone-stable bucketing (matches llm_spend_daily.spend_date pattern).

CREATE TABLE IF NOT EXISTS topic_pushes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  user_id              UUID NOT NULL REFERENCES users(id),
  push_date            TEXT NOT NULL,                     -- YYYY-MM-DD CST
  source               TEXT NOT NULL,                     -- 'feigua' | 'newrank' | 'huitun' | 'dongchamao' | 'manual'
  topics_json          JSONB NOT NULL DEFAULT '[]',       -- [{rank, title, video_url, plays, hotness, category, llm_analysis}]
  opened_at            TIMESTAMPTZ,
  clicked_topic_index  INTEGER,                           -- which of topics_json[] the user picked
  used_in_run_id       UUID REFERENCES workflow_runs(id), -- back-ref if user kicked off workflow
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topic_pushes_tenant ON topic_pushes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_topic_pushes_user_date ON topic_pushes(user_id, push_date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_topic_pushes_user_date
  ON topic_pushes(user_id, push_date);

ALTER TABLE topic_pushes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY topic_pushes_tenant_isolation ON topic_pushes
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Monthly Usage ────────────────────────────────────────────────────────────
-- Per-user monthly aggregate. Single row per (user, month_key). Used for
-- D23 cap (60 video clips/month) and unit economics tracking.
-- month_key as YYYY-MM CST text.

CREATE TABLE IF NOT EXISTS monthly_usage (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  user_id             UUID NOT NULL REFERENCES users(id),
  month_key           TEXT NOT NULL,                  -- YYYY-MM CST
  video_count         INTEGER NOT NULL DEFAULT 0,     -- D23 cap counter
  workflow_run_count  INTEGER NOT NULL DEFAULT 0,
  total_cost_fen      INTEGER NOT NULL DEFAULT 0,    -- 分 = 0.01 元
  last_updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monthly_usage_tenant_month ON monthly_usage(tenant_id, month_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_usage_user_month
  ON monthly_usage(user_id, month_key);

ALTER TABLE monthly_usage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY monthly_usage_tenant_isolation ON monthly_usage
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── updated_at auto-bump trigger (workflow_runs + workflow_steps) ────────────

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workflow_runs_updated_at ON workflow_runs;
CREATE TRIGGER workflow_runs_updated_at
  BEFORE UPDATE ON workflow_runs
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS workflow_steps_updated_at ON workflow_steps;
CREATE TRIGGER workflow_steps_updated_at
  BEFORE UPDATE ON workflow_steps
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
