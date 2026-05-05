// 005: workflow_runs.seed_input
// Idempotent. Run: pnpm db:migrate:seed-input
// SQL mirror: drizzle/0005_workflow_seed_input.sql

import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');

  const sql = postgres(url, { max: 1, prepare: false });
  try {
    console.log('--- Migration 005 — workflow_runs.seed_input ---');
    await sql`ALTER TABLE IF EXISTS workflow_runs ADD COLUMN IF NOT EXISTS seed_input jsonb`;
    console.log('✓ 005 complete');
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
