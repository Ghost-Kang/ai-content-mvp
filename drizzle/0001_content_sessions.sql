-- Migration 001 — content_sessions, content_scripts, suppression_list
-- All tables use Supabase RLS. Enable after table creation.

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE region AS ENUM ('CN', 'INTL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE plan AS ENUM ('solo', 'team');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'member');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE formula AS ENUM ('provocation', 'insight');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE length_mode AS ENUM ('short', 'long');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE channel AS ENUM ('douyin', 'xiaohongshu');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE review_mode AS ENUM ('solo', 'team');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE review_status AS ENUM ('draft', 'in_review', 'changes_requested', 'approved', 'published');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE content_status AS ENUM ('generating', 'draft', 'adapting', 'reviewing', 'approved', 'published');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Tenants ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  region      region NOT NULL,
  plan        plan NOT NULL DEFAULT 'solo',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenants
  USING (id = current_setting('app.tenant_id', true)::uuid);

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  clerk_user_id TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'member',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk ON users(clerk_user_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_tenant_isolation ON users
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ─── Suppression List ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS suppression_list (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL,
  pattern     TEXT NOT NULL,
  description TEXT NOT NULL,
  is_regex    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the initial 4 suppression categories from D7
INSERT INTO suppression_list (category, pattern, description) VALUES
  ('hollow_opener', '在当今快节奏的商业环境中', '空洞过渡句：时代背景开场'),
  ('hollow_opener', '随着科技的飞速发展', '空洞过渡句：科技发展开场'),
  ('hollow_opener', '在这个充满机遇与挑战的时代', '空洞过渡句：机遇挑战开场'),
  ('hollow_opener', '作为一个现代人', '空洞过渡句：现代人开场'),
  ('hollow_opener', '众所周知', '空洞过渡句：众所周知开场'),
  ('uniform_positive', '完全解决了', '全正向措辞：完全解决'),
  ('uniform_positive', '彻底改变了', '全正向措辞：彻底改变'),
  ('false_claim', '一键生成完整营销方案', '错误功能描述：一键完整'),
  ('false_claim', '100%准确率', '错误功能描述：100%准确')
ON CONFLICT DO NOTHING;

-- ─── Content Sessions ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  created_by      UUID NOT NULL REFERENCES users(id),
  entry_point     TEXT NOT NULL,
  formula         formula NOT NULL,
  length_mode     length_mode NOT NULL,
  product_name    TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  core_claim      TEXT NOT NULL,
  status          content_status NOT NULL DEFAULT 'generating',
  brand_voice_id  UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON content_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON content_sessions(status);

ALTER TABLE content_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_tenant_isolation ON content_sessions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ─── Content Scripts ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_scripts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES content_sessions(id),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  frames      JSONB NOT NULL DEFAULT '[]',
  char_count  INTEGER NOT NULL,
  frame_count INTEGER NOT NULL,
  full_text   TEXT NOT NULL,
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  latency_ms  INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  is_current  BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scripts_session ON content_scripts(session_id);
CREATE INDEX IF NOT EXISTS idx_scripts_current ON content_scripts(session_id, is_current);

ALTER TABLE content_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY script_tenant_isolation ON content_scripts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
