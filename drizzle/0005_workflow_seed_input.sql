-- Migration 005 — workflow_runs.seed_input
-- Idempotent: safe to re-run.
-- Run: pnpm db:migrate:seed-input
--
-- Carries optional user-supplied seed context from richer entry points
-- (Quick Create, future templates / strategy-first / brand-voice presets)
-- into the orchestrator. Mirrors the export_overrides slot pattern from
-- migration 003 — single nullable JSONB column, parsed/validated server-side.
--
-- Shape (loose, parser is fail-closed):
--   {
--     "formula":        "provocation" | "insight",
--     "lengthMode":     "short" | "long",
--     "productName":    string,
--     "targetAudience": string,
--     "coreClaim":      string,
--     "sourceMeta":     { platform, opusId, rank, url, authorNickname }
--   }

ALTER TABLE IF EXISTS workflow_runs
  ADD COLUMN IF NOT EXISTS seed_input jsonb;
